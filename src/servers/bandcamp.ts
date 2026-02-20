// src/servers/bandcamp.ts
/**
 * Bandcamp tools — independent music marketplace data extraction.
 *
 * 5-layer extraction approach:
 *   1. Pagedata parsing (<div id="pagedata" data-blob="..."> + data-tralbum)
 *   2. Internal Discover API (bandcamp.com/api/discover/1/discover_web)
 *   3. Search page parsing (bandcamp.com/search?q=... via cheerio)
 *   4. oEmbed (bandcamp.com/services/oembed)
 *   5. RSS feeds ({artist}.bandcamp.com/feed via rss-parser)
 */

import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import * as cheerio from "cheerio";

const USER_AGENT = "Crate/1.0 (music-research-agent)";

// ---------------------------------------------------------------------------
// Rate Limiting
// ---------------------------------------------------------------------------

let lastRequest = 0;
const MIN_DELAY_MS = 1500;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequest;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_DELAY_MS - elapsed));
  }
  lastRequest = Date.now();
}

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

// ---------------------------------------------------------------------------
// Fetch Wrapper
// ---------------------------------------------------------------------------

export async function bandcampFetch(url: string): Promise<string | null> {
  try {
    await rateLimit();
    const resp = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pagedata Extractor
// ---------------------------------------------------------------------------

export function extractPagedata(html: string): any | null {
  const match = html.match(/id="pagedata"\s+data-blob="([^"]*)"/);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tralbum Extractor
// ---------------------------------------------------------------------------

export function extractTralbum(html: string): any | null {
  const match = html.match(/data-tralbum='([^']*)'/);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Type mapping for search item_type parameter
// ---------------------------------------------------------------------------

const ITEM_TYPE_MAP: Record<string, string> = {
  artist: "b",
  album: "a",
  track: "t",
  label: "b", // labels use same code as bands
};

// ---------------------------------------------------------------------------
// search_bandcamp handler
// ---------------------------------------------------------------------------

export async function searchBandcampHandler(args: {
  query: string;
  item_type?: "artist" | "album" | "track" | "label";
}) {
  try {
    let url = `https://bandcamp.com/search?q=${encodeURIComponent(args.query)}`;
    if (args.item_type && ITEM_TYPE_MAP[args.item_type]) {
      url += `&item_type=${ITEM_TYPE_MAP[args.item_type]}`;
    }

    const html = await bandcampFetch(url);
    if (!html) throw new Error("Failed to fetch Bandcamp search results");

    const $ = cheerio.load(html);
    const results: any[] = [];

    $(".searchresult").each((_, el) => {
      const $el = $(el);
      const classes = $el.attr("class") ?? "";

      let type: string = "unknown";
      if (classes.includes("band")) type = "artist";
      else if (classes.includes("album")) type = "album";
      else if (classes.includes("track")) type = "track";
      else if (classes.includes("label")) type = "label";

      const name = $el.find(".heading a").text().trim();
      const itemUrl = $el.find(".heading a").attr("href") ?? "";
      const subhead = $el.find(".subhead").text().trim();
      const tagsText = $el.find(".tags").text().trim();
      const location = $el.find(".location").text().trim() || undefined;
      const imageUrl = $el.find(".art img").attr("src") || undefined;

      // Parse "by Artist" from subhead for albums/tracks
      let artist: string | undefined;
      let album: string | undefined;
      if (type === "album" || type === "track") {
        const byMatch = subhead.match(/^by\s+(.+)/i);
        if (byMatch) artist = byMatch[1]?.trim();
      }
      if (type === "track") {
        const fromMatch = subhead.match(/from\s+(.+)/i);
        if (fromMatch) album = fromMatch[1]?.trim();
      }

      const tags = tagsText
        ? tagsText.replace(/^tags:\s*/i, "").split(",").map((t: string) => t.trim()).filter(Boolean)
        : undefined;

      results.push({
        type,
        name,
        url: itemUrl,
        ...(artist && { artist }),
        ...(album && { album }),
        ...(imageUrl && { image_url: imageUrl }),
        ...(tags && tags.length > 0 && { tags }),
        ...(location && { location }),
      });
    });

    return toolResult({
      query: args.query,
      item_type: args.item_type ?? "all",
      result_count: results.length,
      results,
    });
  } catch (error) {
    return toolError(error);
  }
}

const searchBandcamp = tool(
  "search_bandcamp",
  "Search Bandcamp for artists, albums, tracks, or labels. " +
    "Returns names, URLs, tags, and locations. " +
    "Use for finding independent artists and releases on Bandcamp.",
  {
    query: z.string().describe("Search terms (e.g. 'Boards of Canada', 'lo-fi hip hop')"),
    item_type: z
      .enum(["artist", "album", "track", "label"])
      .optional()
      .describe("Filter by type (default: all types)"),
  },
  searchBandcampHandler,
);

// ---------------------------------------------------------------------------
// Server export
// ---------------------------------------------------------------------------

export const bandcampServer = createSdkMcpServer({
  name: "bandcamp",
  version: "1.0.0",
  tools: [searchBandcamp],
});
