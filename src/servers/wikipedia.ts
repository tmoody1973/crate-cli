// src/servers/wikipedia.ts
/**
 * Wikipedia tools — biographical context, historical narrative,
 * genre histories, scene overviews, and cultural significance.
 *
 * Free endpoints (always available, no API key):
 *   - Search:   GET https://en.wikipedia.org/w/rest.php/v1/search/page?q=...&limit=...
 *   - Summary:  GET https://en.wikipedia.org/api/rest_v1/page/summary/{title}
 *   - Page:     GET https://en.wikipedia.org/w/rest.php/v1/page/{title}  (wikitext source)
 *
 * Enterprise endpoints (optional, requires WIKIMEDIA_USERNAME + WIKIMEDIA_PASSWORD):
 *   - Auth:     POST https://auth.enterprise.wikimedia.com/v1/login
 *   - Article:  GET  https://api.enterprise.wikimedia.com/v2/structured-contents/en.wikipedia/{title}
 */

import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// Free public endpoints (no auth required)
const SEARCH_URL = "https://en.wikipedia.org/w/rest.php/v1/search/page";
const SUMMARY_URL = "https://en.wikipedia.org/api/rest_v1/page/summary";
const PAGE_URL = "https://en.wikipedia.org/w/rest.php/v1/page";

// Wikimedia Enterprise endpoints (optional)
const ENTERPRISE_AUTH_URL = "https://auth.enterprise.wikimedia.com/v1/login";
const ENTERPRISE_API_URL = "https://api.enterprise.wikimedia.com/v2/structured-contents";

const USER_AGENT = "Crate/1.0 (music research CLI; https://github.com/crate-music)";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ToolResult = { content: [{ type: "text"; text: string }] };

function toolResult(data: unknown): ToolResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }] };
}

/** Strip HTML tags for cleaner text output */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract clean text from wikitext source by stripping markup.
 * Best-effort plaintext extraction — not a full parser.
 */
export function cleanWikitext(source: string): string {
  return source
    // Remove templates like {{...}} (non-greedy, single level)
    .replace(/\{\{[^{}]*\}\}/g, "")
    // Remove remaining nested templates (second pass)
    .replace(/\{\{[^{}]*\}\}/g, "")
    // Convert [[Link|Display]] → Display
    .replace(/\[\[[^\]]*\|([^\]]*)\]\]/g, "$1")
    // Remove category/file links (before generic wiki link conversion)
    .replace(/\[\[(Category|File|Image):[^\]]+\]\]/gi, "")
    // Convert [[Link]] → Link
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    // Remove external links [url text] → text
    .replace(/\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g, "$1")
    // Remove bare external links
    .replace(/\[https?:\/\/[^\]]+\]/g, "")
    // Remove ref tags
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    // Remove HTML comments
    .replace(/<!--[\s\S]*?-->/g, "")
    // Convert '''bold''' → bold
    .replace(/'''([^']+)'''/g, "$1")
    // Convert ''italic'' → italic
    .replace(/''([^']+)''/g, "$1")
    // Section headers: == Title == → Title
    .replace(/^={2,}\s*(.+?)\s*={2,}$/gm, "\n$1\n")
    // Clean up whitespace
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Enterprise JWT token management (optional)
// ---------------------------------------------------------------------------

let cachedToken: { token: string; expiresAt: number } | null = null;

export function hasEnterpriseCredentials(): boolean {
  return !!(process.env.WIKIMEDIA_USERNAME && process.env.WIKIMEDIA_PASSWORD);
}

export async function getEnterpriseToken(): Promise<string | null> {
  if (!hasEnterpriseCredentials()) return null;

  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const resp = await fetch(ENTERPRISE_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: process.env.WIKIMEDIA_USERNAME,
      password: process.env.WIKIMEDIA_PASSWORD,
    }),
  });

  if (!resp.ok) {
    cachedToken = null;
    return null; // Silently fall back to free API
  }

  const data = await resp.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ? data.expires_in * 1000 : 23 * 3600_000),
  };

  return cachedToken.token;
}

/** Reset cached Enterprise token (exported for testing) */
export function resetTokenCache(): void {
  cachedToken = null;
}

// ---------------------------------------------------------------------------
// Handler functions (exported for testing)
// ---------------------------------------------------------------------------

export async function searchArticlesHandler(args: {
  query: string;
  limit?: number;
}) {
  try {
    const limit = args.limit ?? 5;
    const url = `${SEARCH_URL}?q=${encodeURIComponent(args.query)}&limit=${limit}`;
    const resp = await fetch(url, {
      headers: { "Api-User-Agent": USER_AGENT, Accept: "application/json" },
    });

    if (!resp.ok) {
      throw new Error(`Wikipedia search API error: ${resp.status} ${resp.statusText}`);
    }

    const data = await resp.json();
    const pages = (data.pages ?? []).map((page: any) => ({
      title: page.title,
      key: page.key,
      description: page.description ?? "",
      excerpt: page.excerpt ? stripHtml(page.excerpt) : "",
      thumbnail: page.thumbnail?.url
        ? page.thumbnail.url.startsWith("//")
          ? `https:${page.thumbnail.url}`
          : page.thumbnail.url
        : null,
    }));
    return toolResult({ query: args.query, result_count: pages.length, pages });
  } catch (error) {
    return toolError(error);
  }
}

export async function getSummaryHandler(args: { title: string }) {
  try {
    const url = `${SUMMARY_URL}/${encodeURIComponent(args.title)}`;
    const resp = await fetch(url, {
      headers: { "Api-User-Agent": USER_AGENT, Accept: "application/json" },
    });

    if (!resp.ok) {
      if (resp.status === 404) throw new Error(`Wikipedia article not found: "${args.title}"`);
      throw new Error(`Wikipedia summary API error: ${resp.status}`);
    }

    const data = await resp.json();
    return toolResult({
      title: data.title ?? args.title,
      description: data.description ?? "",
      extract: data.extract ?? "",
      url: data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(args.title)}`,
      thumbnail: data.thumbnail?.source ?? null,
      last_edited: data.timestamp ?? null,
      type: data.type ?? "standard",
    });
  } catch (error) {
    return toolError(error);
  }
}

/**
 * Try fetching via Wikimedia Enterprise API. Returns cleaned text or null.
 */
async function fetchEnterpriseArticle(
  title: string,
): Promise<{ content: string; id?: number } | null> {
  const token = await getEnterpriseToken();
  if (!token) return null;

  try {
    const url = `${ENTERPRISE_API_URL}/en.wikipedia/${encodeURIComponent(title)}`;
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Api-User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });

    if (!resp.ok) return null;

    const data = await resp.json();
    // Enterprise returns structured content — prefer wikitext if available, else HTML
    const wikitext = data.article_body?.wikitext;
    const html = data.article_body?.html;
    const content = wikitext ? cleanWikitext(wikitext) : html ? stripHtml(html) : null;
    if (!content) return null;

    return { content, id: data.identifier };
  } catch {
    return null; // Fall back to free API
  }
}

/**
 * Fetch article via free Wikipedia REST API (wikitext source).
 */
async function fetchFreeArticle(title: string): Promise<{
  content: string;
  id?: number;
  key?: string;
  license?: string;
  lastEdited?: string | null;
}> {
  const url = `${PAGE_URL}/${encodeURIComponent(title)}`;
  const resp = await fetch(url, {
    headers: { "Api-User-Agent": USER_AGENT, Accept: "application/json" },
  });

  if (!resp.ok) {
    if (resp.status === 404) throw new Error(`Wikipedia article not found: "${title}"`);
    throw new Error(`Wikipedia API error: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json();
  return {
    content: cleanWikitext(data.source ?? ""),
    id: data.id,
    key: data.key ?? title,
    license: data.license?.title ?? "CC BY-SA 4.0",
    lastEdited: data.latest?.timestamp ?? null,
  };
}

export async function getArticleHandler(args: {
  title: string;
  max_chars?: number;
}) {
  try {
    const maxChars = args.max_chars ?? 8000;

    // Try Enterprise first, fall back to free API
    const enterprise = await fetchEnterpriseArticle(args.title);
    const free = enterprise ? null : await fetchFreeArticle(args.title);

    const cleanText = enterprise?.content ?? free!.content;
    const truncated = cleanText.length > maxChars;
    const text = truncated
      ? cleanText.slice(0, maxChars) + "\n\n[... article truncated]"
      : cleanText;

    const key = free?.key ?? args.title;
    return toolResult({
      title: args.title,
      id: enterprise?.id ?? free?.id,
      key,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(key)}`,
      license: free?.license ?? "CC BY-SA 4.0",
      last_edited: free?.lastEdited ?? null,
      source: enterprise ? "enterprise" : "free",
      char_count: cleanText.length,
      truncated,
      content: text,
    });
  } catch (error) {
    return toolError(error);
  }
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const searchArticles = tool(
  "search_articles",
  "Search Wikipedia for articles. Returns titles, descriptions, and excerpts. " +
    "Use for finding artist bios, genre histories, label backgrounds, venue info, " +
    "cultural movements, and any contextual information that structured music databases lack.",
  {
    query: z.string().describe("Search terms (e.g. 'Madlib hip hop producer', 'Detroit techno history')"),
    limit: z.number().min(1).max(20).optional().describe("Max results to return (default 5)"),
  },
  searchArticlesHandler,
);

const getSummary = tool(
  "get_summary",
  "Get a concise Wikipedia article summary (intro paragraphs + metadata). " +
    "Use for quick biographical context, genre overviews, or label backgrounds " +
    "without fetching the full article. Fast and token-efficient.",
  {
    title: z.string().describe(
      "Wikipedia article title (e.g. 'Madlib', 'Detroit_techno', 'Blue_Note_Records'). " +
        "Use underscores for spaces, or use the exact title from search_articles results.",
    ),
  },
  getSummaryHandler,
);

const getArticle = tool(
  "get_article",
  "Get the full Wikipedia article content as clean plaintext. " +
    "Use for deep research when the summary isn't enough — full career histories, " +
    "detailed discography sections, scene timelines, label rosters. " +
    "Returns cleaned text with section headers preserved. Can be long. " +
    "Uses Wikimedia Enterprise API when credentials are configured for richer content.",
  {
    title: z.string().describe(
      "Wikipedia article title (e.g. 'J_Dilla', 'Warp_Records', 'UK_garage'). " +
        "Use underscores for spaces, or the exact key from search_articles results.",
    ),
    max_chars: z.number().min(500).max(50000).optional().describe(
      "Maximum characters to return (default 8000). Increase for comprehensive research.",
    ),
  },
  getArticleHandler,
);

// ---------------------------------------------------------------------------
// Server export
// ---------------------------------------------------------------------------

export const wikipediaServer = createSdkMcpServer({
  name: "wikipedia",
  version: "2.0.0",
  tools: [searchArticles, getSummary, getArticle],
});
