// src/servers/web-search.ts
/**
 * Web Search tools — dual-provider (Tavily + Exa.ai) web search for music
 * research that structured APIs can't cover.
 *
 * Key value: local scene discovery, music blog coverage, alt-weekly features,
 * festival lineups, label site deep dives, forum discussions, and any music
 * context that lives on the open web rather than in structured databases.
 *
 * Architecture:
 *   - Tavily: LLM-optimized search with domain filtering and time ranges.
 *     Best for targeted queries ("Milwaukee experimental jazz 2025").
 *     POST https://api.tavily.com/search
 *     POST https://api.tavily.com/extract
 *
 *   - Exa.ai: Neural/semantic search with find-similar capability.
 *     Best for conceptual discovery ("find labels like Stones Throw").
 *     POST https://api.exa.ai/search
 *     POST https://api.exa.ai/findSimilar
 *
 * Either key enables the server. Both keys = full toolkit.
 * TAVILY_API_KEY: Free 1,000 searches/month at tavily.com
 * EXA_API_KEY: Free $10 credit at exa.ai
 */

import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TAVILY_BASE = "https://api.tavily.com";
const EXA_BASE = "https://api.exa.ai";

// Domains particularly useful for music research
export const MUSIC_DOMAINS = [
  "bandcamp.com",
  "residentadvisor.net",
  "pitchfork.com",
  "stereogum.com",
  "thequietus.com",
  "brooklynvegan.com",
  "factmag.com",
  "tinymixtapes.com",
  "rateyourmusic.com",
  "discogs.com",
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ToolResult = { content: [{ type: "text"; text: string }] };

function toolResult(data: unknown): ToolResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

function tavilyKey(): string {
  const key = process.env.TAVILY_API_KEY ?? "";
  if (!key) throw new Error("TAVILY_API_KEY not set. Get a free key at tavily.com");
  return key;
}

function exaKey(): string {
  const key = process.env.EXA_API_KEY ?? "";
  if (!key) throw new Error("EXA_API_KEY not set. Get a free key at exa.ai");
  return key;
}

export function hasTavily(): boolean {
  return !!process.env.TAVILY_API_KEY;
}

export function hasExa(): boolean {
  return !!process.env.EXA_API_KEY;
}

const FETCH_TIMEOUT_MS = 15_000; // 15s timeout for external API calls

async function tavilyPost(endpoint: string, body: Record<string, any>): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(`${TAVILY_BASE}/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tavilyKey()}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!resp.ok) {
      if (resp.status === 401) throw new Error("Invalid TAVILY_API_KEY. Check your key at tavily.com");
      if (resp.status === 429) throw new Error("Tavily rate limit reached. Wait a moment and retry.");
      throw new Error(`Tavily API error: ${resp.status} ${resp.statusText}`);
    }
    return resp.json();
  } catch (err: any) {
    if (err.name === "AbortError") throw new Error("Tavily request timed out after 15s. The API may be slow — try again.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function exaPost(endpoint: string, body: Record<string, any>): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(`${EXA_BASE}/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": exaKey(),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!resp.ok) {
      if (resp.status === 401) throw new Error("Invalid EXA_API_KEY. Check your key at exa.ai");
      if (resp.status === 429) throw new Error("Exa rate limit reached. Wait a moment and retry.");
      throw new Error(`Exa API error: ${resp.status} ${resp.statusText}`);
    }
    return resp.json();
  } catch (err: any) {
    if (err.name === "AbortError") throw new Error("Exa request timed out after 15s. The API may be slow — try again.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Truncate text content to keep tool results token-efficient */
function truncate(text: string, maxChars: number = 1500): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "…";
}

// ---------------------------------------------------------------------------
// Handler functions (exported for testing)
// ---------------------------------------------------------------------------

export async function searchWebHandler(args: {
  query: string;
  provider: "tavily" | "exa";
  search_depth: "basic" | "advanced";
  topic: "general" | "news";
  time_range?: "day" | "week" | "month" | "year";
  include_domains?: string[];
  exclude_domains?: string[];
  max_results: number;
}) {
  const { query, provider, search_depth, topic, time_range, include_domains, exclude_domains, max_results } = args;

  // Determine actual provider based on availability
  let actualProvider = provider;
  if (provider === "tavily" && !hasTavily()) {
    if (hasExa()) {
      actualProvider = "exa";
    } else {
      throw new Error("No web search API key configured. Set TAVILY_API_KEY or EXA_API_KEY.");
    }
  }
  if (provider === "exa" && !hasExa()) {
    if (hasTavily()) {
      actualProvider = "tavily";
    } else {
      throw new Error("No web search API key configured. Set TAVILY_API_KEY or EXA_API_KEY.");
    }
  }

  if (actualProvider === "tavily") {
    const body: Record<string, any> = {
      query,
      search_depth,
      topic,
      max_results,
      include_answer: false,
      include_raw_content: false,
    };
    if (time_range) body.time_range = time_range;
    if (include_domains?.length) body.include_domains = include_domains;
    if (exclude_domains?.length) body.exclude_domains = exclude_domains;

    const data = await tavilyPost("search", body);

    const results = (data.results ?? []).map((r: any) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      content: truncate(r.content ?? ""),
      score: r.score ?? null,
    }));

    return toolResult({
      provider: "tavily",
      query,
      result_count: results.length,
      response_time: data.response_time ?? null,
      credits_used: data.usage?.credits ?? null,
      results,
    });
  } else {
    const body: Record<string, any> = {
      query,
      numResults: max_results,
      text: true,
      summary: true,
      type: "auto",
    };
    if (include_domains?.length) body.includeDomains = include_domains;
    if (exclude_domains?.length) body.excludeDomains = exclude_domains;

    const data = await exaPost("search", body);

    const results = (data.results ?? []).map((r: any) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      content: truncate(r.text ?? ""),
      summary: r.summary ?? "",
      published_date: r.publishedDate ?? null,
      author: r.author ?? null,
    }));

    return toolResult({
      provider: "exa",
      query,
      search_type: data.searchType ?? "auto",
      result_count: results.length,
      cost: data.costDollars?.total ?? null,
      results,
    });
  }
}

export async function findSimilarHandler(args: {
  url: string;
  num_results: number;
  include_domains?: string[];
  exclude_domains?: string[];
}) {
  if (!hasExa()) {
    throw new Error(
      "find_similar requires EXA_API_KEY. Get a free key at exa.ai. " +
        "Alternatively, use search_web with Tavily for keyword-based discovery."
    );
  }

  const body: Record<string, any> = {
    url: args.url,
    numResults: args.num_results,
    text: true,
    summary: true,
  };
  if (args.include_domains?.length) body.includeDomains = args.include_domains;
  if (args.exclude_domains?.length) body.excludeDomains = args.exclude_domains;

  const data = await exaPost("findSimilar", body);

  const results = (data.results ?? []).map((r: any) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    content: truncate(r.text ?? ""),
    summary: r.summary ?? "",
    published_date: r.publishedDate ?? null,
    author: r.author ?? null,
  }));

  return toolResult({
    provider: "exa",
    source_url: args.url,
    result_count: results.length,
    cost: data.costDollars?.total ?? null,
    results,
  });
}

export async function extractContentHandler(args: {
  urls: string[];
  extract_depth: "basic" | "advanced";
}) {
  if (!hasTavily()) {
    throw new Error(
      "extract_content requires TAVILY_API_KEY. Get a free key at tavily.com. " +
        "Alternatively, use search_web with Exa which includes text content in search results."
    );
  }

  const data = await tavilyPost("extract", {
    urls: args.urls,
    extract_depth: args.extract_depth,
  });

  const results = (data.results ?? []).map((r: any) => ({
    url: r.url ?? "",
    content: truncate(r.raw_content ?? r.content ?? "", 3000),
    failed: false,
  }));

  const failed = (data.failed_results ?? []).map((r: any) => ({
    url: r.url ?? "",
    error: r.error ?? "Extraction failed",
    failed: true,
  }));

  return toolResult({
    provider: "tavily",
    extracted: results.length,
    failed: failed.length,
    credits_used: data.usage?.credits ?? null,
    results: [...results, ...failed],
  });
}

// ---------------------------------------------------------------------------
// Article metadata enrichment (HTML <head> parsing)
// ---------------------------------------------------------------------------

const META_FETCH_TIMEOUT_MS = 5_000;

/** Extract a <meta> tag's content attribute by name or property */
function getMetaContent(html: string, attr: string, value: string): string | undefined {
  // Meta attributes can appear in either order
  const patterns = [
    new RegExp(`<meta\\s+${attr}=["']${value}["']\\s+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+${attr}=["']${value}["']`, "i"),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

/**
 * Parse author and published_date from HTML meta tags and JSON-LD.
 * Checks (in priority order):
 *   Author:  meta[name=author] → meta[property=article:author] → JSON-LD
 *   Date:    meta[property=article:published_time] → meta[name=date] → JSON-LD
 */
export function parseArticleMetadata(html: string): {
  author?: string;
  published_date?: string;
} {
  const result: { author?: string; published_date?: string } = {};

  // --- Author ---
  // 1. <meta name="author">
  result.author = getMetaContent(html, "name", "author");

  // 2. <meta property="article:author"> (skip if it's a URL, e.g. Guardian profile links)
  if (!result.author) {
    const ogAuthor = getMetaContent(html, "property", "article:author");
    if (ogAuthor && !ogAuthor.startsWith("http")) {
      result.author = ogAuthor;
    }
  }

  // --- Published date ---
  // 1. <meta property="article:published_time">
  result.published_date = getMetaContent(html, "property", "article:published_time");

  // 2. <meta name="date"> or <meta name="publish-date">
  if (!result.published_date) {
    result.published_date =
      getMetaContent(html, "name", "date") ??
      getMetaContent(html, "name", "publish-date") ??
      getMetaContent(html, "name", "publication-date");
  }

  // --- JSON-LD fallback for both ---
  if (!result.author || !result.published_date) {
    const jsonLdBlocks = [
      ...html.matchAll(
        /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
      ),
    ];
    for (const block of jsonLdBlocks) {
      if (result.author && result.published_date) break;
      try {
        let ld = JSON.parse(block[1]!);
        if (Array.isArray(ld)) ld = ld[0];
        // Handle @graph (common in WordPress, Pitchfork, etc.)
        if (ld?.["@graph"]) {
          ld =
            ld["@graph"].find(
              (item: any) =>
                item["@type"] === "Article" ||
                item["@type"] === "NewsArticle" ||
                item["@type"] === "Review" ||
                item["@type"] === "MusicAlbum",
            ) ?? ld["@graph"][0];
        }

        if (!result.author && ld?.author) {
          const a = ld.author;
          if (typeof a === "string") result.author = a;
          else if (Array.isArray(a)) result.author = a[0]?.name ?? undefined;
          else if (a?.name) result.author = a.name;
        }

        if (!result.published_date) {
          result.published_date =
            ld?.datePublished ?? ld?.dateCreated ?? undefined;
        }
      } catch {
        // Malformed JSON-LD — skip
      }
    }
  }

  return result;
}

/**
 * Enrich web search results with author and published_date by fetching
 * each article's HTML <head> and parsing meta tags / JSON-LD.
 *
 * - Only fetches URLs where author or published_date is missing
 * - 5s timeout per URL, best-effort (failures silently skipped)
 * - Caps at 10 URLs to limit latency
 */
export async function enrichArticleMetadata<
  T extends Record<string, any> & { url: string },
>(results: T[]): Promise<T[]> {
  const needsEnrichment = results.filter(
    (r) => r.url && (!r.author || !r.published_date),
  );

  if (needsEnrichment.length === 0) return results;

  // Cap parallel fetches to avoid excess latency
  const toEnrich = needsEnrichment.slice(0, 10);

  const fetches = toEnrich.map(async (r) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), META_FETCH_TIMEOUT_MS);
    try {
      const resp = await fetch(r.url, {
        signal: controller.signal,
        headers: { "User-Agent": "CrateCLI/1.0 (music-research-agent)" },
        redirect: "follow",
      });
      if (!resp.ok) return { url: r.url, meta: {} as ReturnType<typeof parseArticleMetadata> };
      // Cap at 50KB to avoid processing huge pages
      const html = (await resp.text()).slice(0, 50_000);
      return { url: r.url, meta: parseArticleMetadata(html) };
    } catch {
      return { url: r.url, meta: {} as ReturnType<typeof parseArticleMetadata> };
    } finally {
      clearTimeout(timer);
    }
  });

  const settled = await Promise.allSettled(fetches);

  // Build url → metadata map
  const metaMap = new Map<string, ReturnType<typeof parseArticleMetadata>>();
  for (const s of settled) {
    if (s.status === "fulfilled" && s.value.url) {
      metaMap.set(s.value.url, s.value.meta);
    }
  }

  // Merge enriched metadata into results (only fill missing fields)
  return results.map((r) => {
    const meta = metaMap.get(r.url);
    if (!meta) return r;
    return {
      ...r,
      author: r.author || meta.author || undefined,
      published_date: r.published_date || meta.published_date || undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const searchWeb = tool(
  "search_web",
  "Search the open web for music content that structured APIs can't provide — " +
    "local scene coverage, music blog features, alt-weekly articles, festival lineups, " +
    "label profiles, forum discussions, interview transcripts, and review roundups. " +
    "Uses Tavily (keyword/filtered) or Exa (semantic/neural) depending on query type. " +
    "Tavily is default and best for specific queries. Exa is better for conceptual discovery.",
  {
    query: z.string().max(500).describe(
      "Search query. Be specific for best results. " +
        "Good: 'Milwaukee experimental jazz scene 2024 2025' " +
        "Good: 'Bristol bass music producers underground labels' " +
        "Bad: 'good music' (too vague)"
    ),
    provider: z.enum(["tavily", "exa"]).default("tavily").describe(
      "Search provider. 'tavily' (default) for keyword-rich, filtered search. " +
        "'exa' for semantic/conceptual queries. Falls back to available provider if preferred isn't configured."
    ),
    search_depth: z.enum(["basic", "advanced"]).default("basic").describe(
      "Tavily only. 'basic' = 1 credit, balanced. 'advanced' = 2 credits, higher relevance with multiple snippets per source."
    ),
    topic: z.enum(["general", "news"]).default("general").describe(
      "Tavily only. 'news' prioritizes recent coverage from media sources. " +
        "'general' for broader web results."
    ),
    time_range: z.enum(["day", "week", "month", "year"]).optional().describe(
      "Tavily only. Filter results by recency. Useful for 'what's happening now' queries."
    ),
    include_domains: z.array(z.string()).optional().describe(
      "Only return results from these domains. " +
        "Useful: ['bandcamp.com', 'residentadvisor.net', 'pitchfork.com']"
    ),
    exclude_domains: z.array(z.string()).optional().describe(
      "Exclude results from these domains. " +
        "Example: exclude ['spotify.com', 'youtube.com'] to focus on editorial content."
    ),
    max_results: z.number().min(1).max(10).default(5).describe("Max results to return (default 5)."),
  },
  searchWebHandler,
);

const findSimilar = tool(
  "find_similar",
  "Find web pages semantically similar to a given URL. Exa.ai only. " +
    "Give it a Bandcamp label page → finds similar labels. " +
    "Give it a music blog → finds blogs covering the same scene. " +
    "Give it a festival site → finds similar festivals. " +
    "Powerful for discovering connected corners of the music web.",
  {
    url: z.string().url().describe(
      "URL to find similar pages for. " +
        "Examples: 'https://stonesthrough.bandcamp.com', " +
        "'https://residentadvisor.net/features/3912', " +
        "'https://www.westword.com/music'"
    ),
    num_results: z.number().min(1).max(10).default(5).describe("Number of similar results (default 5)."),
    include_domains: z.array(z.string()).optional().describe(
      "Only find similar pages from these domains."
    ),
    exclude_domains: z.array(z.string()).optional().describe(
      "Exclude these domains from results."
    ),
  },
  findSimilarHandler,
);

const extractContent = tool(
  "extract_content",
  "Extract clean text content from specific URLs. Tavily only. " +
    "Use when you have URLs and need to read their content — blog posts, " +
    "alt-weekly features, festival lineups, label about pages, interviews. " +
    "Returns cleaned text ready for analysis, not raw HTML.",
  {
    urls: z.array(z.string().url()).min(1).max(5).describe(
      "URLs to extract content from (max 5 per call). " +
        "Example: ['https://www.westword.com/music/denver-electronic-scene-2025']"
    ),
    extract_depth: z.enum(["basic", "advanced"]).default("basic").describe(
      "'basic' = faster, 1 credit per 5 URLs. 'advanced' = more thorough extraction, 2 credits per 5 URLs."
    ),
  },
  extractContentHandler,
);

// ---------------------------------------------------------------------------
// Server export
// ---------------------------------------------------------------------------

export const webSearchTools = [searchWeb, findSimilar, extractContent];

export const webSearchServer = createSdkMcpServer({
  name: "web-search",
  version: "1.0.0",
  tools: webSearchTools,
});
