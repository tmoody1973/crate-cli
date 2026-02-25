// src/servers/news.ts
/**
 * News / RSS Feed MCP server — aggregates music news from major publications.
 *
 * 3 tools:
 *   1. search_music_news — Search recent music news across all feeds
 *   2. get_latest_reviews — Get the latest album/track reviews
 *   3. get_news_sources — List all configured RSS sources and their status
 *
 * Always available — no API key required. Uses the `rss-parser` package.
 */

import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import Parser from "rss-parser";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ToolResult = { content: [{ type: "text"; text: string }] };

function toolResult(data: unknown): ToolResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

function toolError(message: string): ToolResult {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
  };
}

// ---------------------------------------------------------------------------
// RSS Feed Configuration
// ---------------------------------------------------------------------------

interface FeedSource {
  name: string;
  url: string;
  category: "general" | "reviews" | "electronic" | "indie";
}

const FEEDS: FeedSource[] = [
  {
    name: "Pitchfork",
    url: "https://pitchfork.com/feed/feed-news/rss",
    category: "general",
  },
  {
    name: "Stereogum",
    url: "https://www.stereogum.com/feed/",
    category: "indie",
  },
  {
    name: "Resident Advisor",
    url: "https://ra.co/xml/news.xml",
    category: "electronic",
  },
  {
    name: "The Quietus",
    url: "https://thequietus.com/feed",
    category: "indie",
  },
  {
    name: "BrooklynVegan",
    url: "https://www.brooklynvegan.com/feed/",
    category: "general",
  },
  {
    name: "Bandcamp Daily",
    url: "https://daily.bandcamp.com/feed",
    category: "reviews",
  },
  {
    name: "NME",
    url: "https://www.nme.com/music/feed",
    category: "general",
  },
  {
    name: "Consequence of Sound",
    url: "https://consequence.net/feed/",
    category: "general",
  },
  {
    name: "FACT Magazine",
    url: "https://www.factmag.com/feed/",
    category: "electronic",
  },
  {
    name: "NPR Music",
    url: "https://feeds.npr.org/1039/rss.xml",
    category: "general",
  },
];

// Review-focused feeds (Pitchfork reviews, Bandcamp Daily)
const REVIEW_FEED_NAMES = ["Pitchfork", "Bandcamp Daily", "The Quietus"];

// ---------------------------------------------------------------------------
// Parser instance (reused)
// ---------------------------------------------------------------------------

const parser = new Parser({
  timeout: 10_000,
  headers: {
    "User-Agent": "CrateCLI/1.0 (music-research-agent)",
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ParsedItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  snippet: string;
  categories: string[];
}

async function fetchFeed(feed: FeedSource): Promise<ParsedItem[]> {
  try {
    const result = await parser.parseURL(feed.url);
    return (result.items ?? []).map((item) => ({
      title: item.title ?? "(untitled)",
      link: item.link ?? "",
      pubDate: item.pubDate ?? item.isoDate ?? "",
      source: feed.name,
      snippet: stripHtml(item.contentSnippet ?? item.content ?? "").slice(0, 300),
      categories: (item.categories ?? []).map(String),
    }));
  } catch {
    return [];
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function matchesQuery(item: ParsedItem, query: string): boolean {
  const q = query.toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  const haystack = `${item.title} ${item.snippet} ${item.categories.join(" ")}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

// ---------------------------------------------------------------------------
// Handler: search_music_news
// ---------------------------------------------------------------------------

async function handleSearchNews(input: {
  query: string;
  sources?: string[];
  limit?: number;
}): Promise<ToolResult> {
  const { query, sources, limit = 20 } = input;

  // Pick feeds to search
  let feedsToSearch = FEEDS;
  if (sources && sources.length > 0) {
    const sourceNames = sources.map((s) => s.toLowerCase());
    feedsToSearch = FEEDS.filter((f) =>
      sourceNames.some(
        (s) =>
          f.name.toLowerCase().includes(s) ||
          f.category.toLowerCase() === s
      )
    );
    if (feedsToSearch.length === 0) {
      return toolError(
        `No matching sources for: ${sources.join(", ")}. Use get_news_sources to see available sources.`
      );
    }
  }

  // Fetch all selected feeds in parallel
  const results = await Promise.all(feedsToSearch.map(fetchFeed));
  const allItems = results.flat();

  // Filter by query
  const matched = allItems
    .filter((item) => matchesQuery(item, query))
    .sort((a, b) => {
      const da = new Date(a.pubDate).getTime() || 0;
      const db = new Date(b.pubDate).getTime() || 0;
      return db - da;
    })
    .slice(0, limit);

  return toolResult({
    query,
    total: matched.length,
    sources_searched: feedsToSearch.map((f) => f.name),
    articles: matched.map((item) => ({
      title: item.title,
      source: item.source,
      date: item.pubDate,
      url: item.link,
      snippet: item.snippet,
      tags: item.categories,
    })),
  });
}

// ---------------------------------------------------------------------------
// Handler: get_latest_reviews
// ---------------------------------------------------------------------------

async function handleLatestReviews(input: {
  source?: string;
  limit?: number;
}): Promise<ToolResult> {
  const { source, limit = 15 } = input;

  // Default to review-focused feeds, or filter to a specific source
  let feedsToSearch: FeedSource[];
  if (source) {
    const s = source.toLowerCase();
    feedsToSearch = FEEDS.filter(
      (f) =>
        f.name.toLowerCase().includes(s) ||
        f.category.toLowerCase() === s
    );
    if (feedsToSearch.length === 0) {
      return toolError(
        `No matching source: "${source}". Use get_news_sources to see available sources.`
      );
    }
  } else {
    feedsToSearch = FEEDS.filter((f) =>
      REVIEW_FEED_NAMES.includes(f.name) || f.category === "reviews"
    );
  }

  const results = await Promise.all(feedsToSearch.map(fetchFeed));
  const allItems = results
    .flat()
    .sort((a, b) => {
      const da = new Date(a.pubDate).getTime() || 0;
      const db = new Date(b.pubDate).getTime() || 0;
      return db - da;
    })
    .slice(0, limit);

  return toolResult({
    sources: feedsToSearch.map((f) => f.name),
    total: allItems.length,
    reviews: allItems.map((item) => ({
      title: item.title,
      source: item.source,
      date: item.pubDate,
      url: item.link,
      snippet: item.snippet,
      tags: item.categories,
    })),
  });
}

// ---------------------------------------------------------------------------
// Handler: get_news_sources
// ---------------------------------------------------------------------------

async function handleGetSources(): Promise<ToolResult> {
  // Quick health check — try to fetch each feed with a short timeout
  const checks = await Promise.all(
    FEEDS.map(async (feed) => {
      try {
        const result = await parser.parseURL(feed.url);
        return {
          name: feed.name,
          url: feed.url,
          category: feed.category,
          status: "ok" as const,
          item_count: result.items?.length ?? 0,
          last_update: result.items?.[0]?.pubDate ?? result.items?.[0]?.isoDate ?? "unknown",
        };
      } catch {
        return {
          name: feed.name,
          url: feed.url,
          category: feed.category,
          status: "error" as const,
          item_count: 0,
          last_update: "unavailable",
        };
      }
    })
  );

  return toolResult({
    total: checks.length,
    sources: checks,
    categories: [...new Set(FEEDS.map((f) => f.category))],
  });
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const searchNewsTool = tool(
  "search_music_news",
  "Search recent music news across RSS feeds from major publications. Filter by source name or category.",
  {
    query: z.string().max(200).describe("Search terms (e.g. artist name, album title, genre, topic)"),
    sources: z
      .array(z.string())
      .optional()
      .describe(
        "Filter by source names or categories: pitchfork, stereogum, nme, electronic, indie, reviews, general"
      ),
    limit: z
      .number()
      .min(1)
      .max(50)
      .optional()
      .describe("Max results to return (default 20)"),
  },
  handleSearchNews
);

const latestReviewsTool = tool(
  "get_latest_reviews",
  "Get the latest album and track reviews from music publications. Defaults to review-focused sources (Pitchfork, Bandcamp Daily, The Quietus).",
  {
    source: z
      .string()
      .max(100)
      .optional()
      .describe("Filter to a specific source name or category"),
    limit: z
      .number()
      .min(1)
      .max(50)
      .optional()
      .describe("Max reviews to return (default 15)"),
  },
  handleLatestReviews
);

const getSourcesTool = tool(
  "get_news_sources",
  "List all configured RSS news sources with their status, category, and latest update time.",
  {},
  handleGetSources
);

// ---------------------------------------------------------------------------
// Server export
// ---------------------------------------------------------------------------

export const newsTools = [searchNewsTool, latestReviewsTool, getSourcesTool];

export const newsServer = createSdkMcpServer({
  name: "news",
  version: "1.0.0",
  tools: newsTools,
});
