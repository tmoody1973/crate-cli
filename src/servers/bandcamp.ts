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
// Server export (tools added in subsequent tasks)
// ---------------------------------------------------------------------------

export const bandcampServer = createSdkMcpServer({
  name: "bandcamp",
  version: "1.0.0",
  tools: [],
});
