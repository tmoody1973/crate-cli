// src/servers/wikipedia.ts
/**
 * Wikipedia / Wikimedia API tools — biographical context, historical narrative,
 * genre histories, scene overviews, and cultural significance.
 *
 * Key value: narrative and historical context that structured music databases
 * (MusicBrainz, Discogs) can't provide — artist biographies, genre origins,
 * cultural movements, label histories, venue significance.
 *
 * Uses the Wikimedia Core REST API (api.wikimedia.org) which requires a
 * Personal API Token (free at api.wikimedia.org/wiki/Getting_started).
 *
 * Endpoints:
 *   - Search:   GET /core/v1/wikipedia/en/search/page?q=...&limit=...
 *   - Page:     GET /core/v1/wikipedia/en/page/{title}        (wikitext source)
 *   - Summary:  GET https://en.wikipedia.org/api/rest_v1/page/summary/{title}
 */

import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const CORE_BASE = "https://api.wikimedia.org/core/v1/wikipedia/en";
const SUMMARY_BASE = "https://en.wikipedia.org/api/rest_v1/page/summary";

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

export function wikiHeaders(): Record<string, string> {
  const token = process.env.WIKIPEDIA_ACCESS_TOKEN ?? "";
  return {
    Authorization: `Bearer ${token}`,
    "Api-User-Agent": "Crate/1.0 (music research CLI; https://github.com/crate-music)",
    Accept: "application/json",
  };
}

export async function wikiGet(url: string): Promise<any> {
  const resp = await fetch(url, { headers: wikiHeaders() });
  if (!resp.ok) {
    if (resp.status === 401) throw new Error("Invalid Wikipedia access token. Check WIKIPEDIA_ACCESS_TOKEN.");
    if (resp.status === 404) throw new Error("Page not found on Wikipedia.");
    throw new Error(`Wikipedia API error: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
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
// Handler functions (exported for testing)
// ---------------------------------------------------------------------------

export async function searchArticlesHandler(args: {
  query: string;
  limit?: number;
}) {
  try {
    const limit = args.limit ?? 5;
    const url = `${CORE_BASE}/search/page?q=${encodeURIComponent(args.query)}&limit=${limit}`;
    const data = await wikiGet(url);
    const pages = (data.pages ?? []).map((page: any) => ({
      title: page.title,
      key: page.key,
      description: page.description ?? "",
      excerpt: page.excerpt ? stripHtml(page.excerpt) : "",
      thumbnail: page.thumbnail?.url ? `https:${page.thumbnail.url}` : null,
    }));
    return toolResult({ query: args.query, result_count: pages.length, pages });
  } catch (error) {
    return toolError(error);
  }
}

export async function getSummaryHandler(args: { title: string }) {
  try {
    // The summary endpoint is a public REST endpoint — no Bearer auth needed.
    const url = `${SUMMARY_BASE}/${encodeURIComponent(args.title)}`;
    const resp = await fetch(url, {
      headers: {
        "Api-User-Agent": "Crate/1.0 (music research CLI; https://github.com/crate-music)",
        Accept: "application/json",
      },
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

export async function getArticleHandler(args: {
  title: string;
  max_chars?: number;
}) {
  try {
    const maxChars = args.max_chars ?? 8000;
    const url = `${CORE_BASE}/page/${encodeURIComponent(args.title)}`;
    const data = await wikiGet(url);

    const source = data.source ?? "";
    const cleanText = cleanWikitext(source);

    const truncated = cleanText.length > maxChars;
    const text = truncated
      ? cleanText.slice(0, maxChars) + "\n\n[... article truncated]"
      : cleanText;

    return toolResult({
      title: data.title ?? args.title,
      id: data.id,
      key: data.key ?? args.title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(data.key ?? args.title)}`,
      license: data.license?.title ?? "CC BY-SA 4.0",
      last_edited: data.latest?.timestamp ?? null,
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
    "Returns cleaned text with section headers preserved. Can be long.",
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
  version: "1.0.0",
  tools: [searchArticles, getSummary, getArticle],
});
