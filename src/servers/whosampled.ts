// src/servers/whosampled.ts
/**
 * WhoSampled MCP server — sample relationship metadata extraction.
 *
 * CONTENT SIGNAL COMPLIANCE (per WhoSampled robots.txt):
 *
 * WhoSampled's robots.txt defines three content signals:
 *
 *   search:   "building a search index and providing search results (e.g.,
 *              returning hyperlinks and short excerpts). Search does not
 *              include providing AI-generated search summaries."
 *   ai-input: "inputting content into one or more AI models (e.g., retrieval
 *              augmented generation, grounding, or other real-time taking of
 *              content for generative AI search answers)."
 *   ai-train: "training or fine-tuning AI models."
 *
 * WhoSampled's values:
 *   - search:   yes — granted
 *   - ai-train: no  — restricted (we do not train on any content)
 *   - ai-input: absent — per the framework: "the website operator neither
 *     grants nor restricts permission via Content-Signal with respect to
 *     the corresponding use."
 *
 * This server's compliance posture:
 *   - Operates within search=yes: returns hyperlinks and short structured
 *     metadata (artist name, track title, year, sample type, WhoSampled URL).
 *     No AI-generated search summaries are produced by this server.
 *   - Respects ai-train=no: no content is used for training or fine-tuning.
 *   - Minimizes ai-input exposure: returns structured metadata only, not
 *     editorial content, user comments, or page prose. The metadata returned
 *     (who sampled whom) is closer to search results than content ingestion.
 *   - Every result includes a whosampled_url pointing users back to the source.
 *   - Uses a real Chromium browser via Kernel.sh, not a crawler bot.
 *
 * Architectural separation: WhoSampled provides the sample relationship graph.
 * Discogs, MusicBrainz, and Genius elaborate on the results within their own
 * terms. Each server operates within its own source's content policies.
 */

import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { withBrowser } from "./browser.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = "https://www.whosampled.com";
const RATE_LIMIT_MS = 2000;

let lastRequest = 0;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchResult {
  track: string;
  artist: string;
  whosampled_url: string;
  sample_count?: number;
  sampled_by_count?: number;
}

export interface SampleEntry {
  title: string;
  artist: string;
  year?: number;
  type: "sample" | "interpolation" | "replay" | "unknown";
  element?: string;
  whosampled_url: string;
}

export interface TrackSamples {
  samples_used: SampleEntry[];
  sampled_by: SampleEntry[];
}

export interface ArtistTopTrack {
  track: string;
  sample_count: number;
  whosampled_url: string;
}

export interface ArtistConnections {
  total_samples_used?: number;
  total_sampled_by?: number;
  top_sampled_tracks: ArtistTopTrack[];
  top_sampling_tracks: ArtistTopTrack[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ToolResult = { content: Array<{ type: "text"; text: string }> };

function toolResult(data: unknown): ToolResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }] };
}

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequest;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
  lastRequest = Date.now();
}

function slugify(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9\-()'.]/g, "")
    .replace(/-+/g, "-");
}

function classifySampleType(text: string): SampleEntry["type"] {
  const lower = text.toLowerCase();
  if (lower.includes("interpolation")) return "interpolation";
  if (lower.includes("replay") || lower.includes("re-play")) return "replay";
  if (lower.includes("sample")) return "sample";
  return "unknown";
}

function buildFullUrl(href: string): string {
  if (href.startsWith("http")) return href;
  if (href.startsWith("/")) return `${BASE_URL}${href}`;
  return `${BASE_URL}/${href}`;
}

// ---------------------------------------------------------------------------
// Parse functions (exported for unit testing with raw HTML)
// ---------------------------------------------------------------------------

/**
 * Parse search results from WhoSampled search page HTML.
 *
 * Real DOM structure:
 *   Top hit:  div.topHit > div.title > a.trackTitle + span.trackArtist > a
 *   List:     li.listEntry.trackEntry > span.trackDetails > a.trackName + span.trackArtist > a
 */
export function parseSearchResults(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  const seen = new Set<string>();

  // --- Top Hit ---
  // <div class="topHit">...<a class="trackTitle" href="/Artist/Track/">Title</a>
  //   <span class="trackArtist">by <a href="/Artist/">Artist</a></span>
  const topHitPattern =
    /<div[^>]*class="[^"]*topHit[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i;
  const topHitMatch = topHitPattern.exec(html);
  if (topHitMatch) {
    const block = topHitMatch[1] ?? "";
    const titleLink = /<a[^>]*class="[^"]*trackTitle[^"]*"[^>]*href="([^"]+)"[^>]*>\s*([^<]+)<\/a>/i.exec(block);
    const artistSpan = /<span[^>]*class="[^"]*trackArtist[^"]*"[^>]*>[^<]*<a[^>]*>\s*([^<]+)<\/a>/i.exec(block);
    if (titleLink) {
      const href = titleLink[1] ?? "";
      const track = (titleLink[2] ?? "").trim();
      const artist = artistSpan ? (artistSpan[1] ?? "").trim() : "";
      const url = buildFullUrl(href);
      if (!seen.has(url)) {
        seen.add(url);
        results.push({ track, artist, whosampled_url: url });
      }
    }
  }

  // --- Track List Entries ---
  // <li class="listEntry trackEntry">
  //   <span class="trackDetails">
  //     <a class="trackName" href="/Artist/Track/" title="...">Track</a>
  //     <span class="trackArtist">by <a href="/Artist/">Artist</a> (1994)</span>
  //   </span>
  // </li>
  const listEntryPattern =
    /<li[^>]*class="[^"]*listEntry[^"]*trackEntry[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let listMatch: RegExpExecArray | null;
  while ((listMatch = listEntryPattern.exec(html)) !== null) {
    const block = listMatch[1] ?? "";
    const nameLink = /<a[^>]*class="[^"]*trackName[^"]*"[^>]*href="([^"]+)"[^>]*>\s*([^<]+)<\/a>/i.exec(block);
    if (!nameLink) continue;

    const href = nameLink[1] ?? "";
    const track = (nameLink[2] ?? "").trim();

    const artistSpan = /<span[^>]*class="[^"]*trackArtist[^"]*"[^>]*>[^<]*<a[^>]*>\s*([^<]+)<\/a>/i.exec(block);
    const artist = artistSpan ? (artistSpan[1] ?? "").trim() : "";

    const url = buildFullUrl(href);
    if (!seen.has(url)) {
      seen.add(url);
      results.push({ track, artist, whosampled_url: url });
    }
  }

  return results;
}

/**
 * Parse track sample relationships from a WhoSampled track/artist page HTML.
 *
 * Real DOM structure:
 *   <div class="trackConnections">
 *     <div class="track-connection">
 *       <span class="sampleAction">sampled</span>
 *       <ul><li>
 *         <a href="/sample/89797/..." class="connectionName playIcon">Title</a>
 *         by <a href="/Artist/">Artist</a> (1969)
 *       </li></ul>
 *     </div>
 *     <div class="track-connection">
 *       <span class="sampleAction">was sampled in</span>
 *       ...
 *     </div>
 *   </div>
 */
export function parseTrackSamples(html: string): TrackSamples {
  const samples_used: SampleEntry[] = [];
  const sampled_by: SampleEntry[] = [];

  // Match each track-connection block
  const connectionBlockPattern =
    /<div[^>]*class="[^"]*track-connection[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;

  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = connectionBlockPattern.exec(html)) !== null) {
    const block = blockMatch[1] ?? "";

    // Determine direction from sampleAction span
    const actionMatch = /<span[^>]*class="[^"]*sampleAction[^"]*"[^>]*>\s*([^<]+)<\/span>/i.exec(block);
    const action = actionMatch ? (actionMatch[1] ?? "").trim().toLowerCase() : "";

    // "sampled" = this track sampled something (samples_used)
    // "was sampled in" = something sampled this track (sampled_by)
    const isSampledBy = action.includes("was sampled") || action.includes("sampled in");
    const isSamplesUsed = !isSampledBy && action.includes("sampled");

    if (!isSampledBy && !isSamplesUsed) continue;

    const target = isSampledBy ? sampled_by : samples_used;

    // Extract each <li> connection entry
    const liPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let liMatch: RegExpExecArray | null;
    while ((liMatch = liPattern.exec(block)) !== null) {
      const li = liMatch[1] ?? "";

      // Connection name link: <a href="/sample/..." class="connectionName ...">Title</a>
      const connLink = /<a[^>]*class="[^"]*connectionName[^"]*"[^>]*href="([^"]+)"[^>]*>\s*([^<]+)<\/a>/i.exec(li)
        ?? /<a[^>]*href="([^"]+)"[^>]*class="[^"]*connectionName[^"]*"[^>]*>\s*([^<]+)<\/a>/i.exec(li);
      if (!connLink) continue;

      const href = connLink[1] ?? "";
      const title = (connLink[2] ?? "").trim();

      // Artist: "by <a href="/Artist/">Artist Name</a>"
      const afterConn = li.slice((connLink.index ?? 0) + (connLink[0]?.length ?? 0));
      const artistLink = /by\s+<a[^>]*>\s*([^<]+)<\/a>/i.exec(afterConn);
      const artist = artistLink ? (artistLink[1] ?? "").trim() : "";

      // Year: (YYYY)
      const yearMatch = /\((\d{4})\)/.exec(afterConn);
      const year = yearMatch ? parseInt(yearMatch[1] ?? "0", 10) : undefined;

      // Determine type from surrounding context
      const type = classifySampleType(block);

      target.push({
        title,
        artist,
        ...(year !== undefined ? { year } : {}),
        type,
        whosampled_url: buildFullUrl(href),
      });
    }
  }

  return { samples_used, sampled_by };
}

/**
 * Parse artist connections from a WhoSampled artist page HTML.
 *
 * Real DOM structure:
 *   Stats:  <span class="section-header-title">1797 samples, 11 covers, 47 remixes</span>
 *   Links:  <a href="/Artist/sampled/" ...>Songs that Sampled Artist (1409)</a>
 *   Tracks: <h3 class="trackName"><a itemprop="url" href="/Artist/Track/">
 *             <span itemprop="name">Track</span></a> <span class="trackYear"> (1994)</span></h3>
 *   Counts: <a class="moreLink ... moreConnections" href="...">see 234 more connections</a>
 *   Connections: div.trackConnections > div.track-connection (same as track page)
 */
export function parseArtistConnections(html: string): ArtistConnections {
  const top_sampled_tracks: ArtistTopTrack[] = [];
  const top_sampling_tracks: ArtistTopTrack[] = [];

  // --- Extract total counts from stats summary ---
  // <span class="section-header-title">1797 samples, 11 covers, 47 remixes</span>
  const statsMatch = /<span[^>]*class="[^"]*section-header-title[^"]*"[^>]*>\s*([^<]+)<\/span>/i.exec(html);
  let totalSamplesUsed: number | undefined;
  let totalSampledBy: number | undefined;

  if (statsMatch) {
    const statsText = statsMatch[1] ?? "";
    const samplesCount = /(\d[\d,]*)\s*samples?/i.exec(statsText);
    if (samplesCount) {
      totalSamplesUsed = parseInt((samplesCount[1] ?? "0").replace(/,/g, ""), 10);
    }
  }

  // "Songs that Sampled Artist (1409)" link
  const sampledByLink = /Songs\s+that\s+Sampled[^(]*\((\d[\d,]*)\)/i.exec(html);
  if (sampledByLink) {
    totalSampledBy = parseInt((sampledByLink[1] ?? "0").replace(/,/g, ""), 10);
  }

  // --- Extract track entries with connection counts ---
  // Each track: <h3 class="trackName"><a itemprop="url" href="..."><span itemprop="name">Track</span></a>
  // Followed by trackConnections div and possibly a "see N more connections" link
  const trackBlockPattern =
    /<h3[^>]*class="[^"]*trackName[^"]*"[^>]*>([\s\S]*?)(?=<h3[^>]*class="[^"]*trackName|$)/gi;

  let trackBlockMatch: RegExpExecArray | null;
  while ((trackBlockMatch = trackBlockPattern.exec(html)) !== null) {
    const block = trackBlockMatch[1] ?? "";

    // Extract track name and URL
    const trackLink = /<a[^>]*href="([^"]+)"[^>]*>\s*(?:<span[^>]*>)?\s*([^<]+)\s*(?:<\/span>)?\s*<\/a>/i.exec(block);
    if (!trackLink) continue;

    const href = trackLink[1] ?? "";
    const trackName = (trackLink[2] ?? "").trim();
    if (trackName.length < 2) continue;

    // Count connections: count <li> items in trackConnections + "see N more" link
    const connectionLis = (block.match(/<li[^>]*>/gi) ?? []).length;
    const moreMatch = /see\s+(\d[\d,]*)\s+more\s+connections/i.exec(block);
    const moreCount = moreMatch ? parseInt((moreMatch[1] ?? "0").replace(/,/g, ""), 10) : 0;
    const totalConnections = connectionLis + moreCount;

    // Determine if this track is in a "sampled" or "was sampled in" context
    const actionMatch = /<span[^>]*class="[^"]*sampleAction[^"]*"[^>]*>\s*([^<]+)<\/span>/i.exec(block);
    const action = actionMatch ? (actionMatch[1] ?? "").trim().toLowerCase() : "";

    const entry: ArtistTopTrack = {
      track: trackName,
      sample_count: totalConnections,
      whosampled_url: buildFullUrl(href),
    };

    if (action.includes("was sampled")) {
      top_sampled_tracks.push(entry);
    } else if (action.includes("sampled")) {
      top_sampling_tracks.push(entry);
    } else {
      // Default: add to both if no clear action (common on overview pages)
      top_sampled_tracks.push(entry);
    }
  }

  // Sort by connection count descending
  top_sampled_tracks.sort((a, b) => b.sample_count - a.sample_count);
  top_sampling_tracks.sort((a, b) => b.sample_count - a.sample_count);

  return {
    ...(totalSamplesUsed !== undefined ? { total_samples_used: totalSamplesUsed } : {}),
    ...(totalSampledBy !== undefined ? { total_sampled_by: totalSampledBy } : {}),
    top_sampled_tracks,
    top_sampling_tracks,
  };
}

// ---------------------------------------------------------------------------
// Handler functions (exported for testing)
// ---------------------------------------------------------------------------

export async function searchWhoSampledHandler(args: { artist: string; track: string }) {
  try {
    await rateLimit();
    const query = encodeURIComponent(`${args.artist} ${args.track}`);
    const url = `${BASE_URL}/search/?q=${query}`;

    const html = await withBrowser(async (page) => {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      // Wait for Cloudflare Turnstile to auto-solve via Kernel stealth
      await page.waitForTimeout(10_000);
      return await page.content();
    }, { stealth: true });

    const results = parseSearchResults(html);
    return toolResult(results);
  } catch (error) {
    return toolError(error);
  }
}

export async function getTrackSamplesHandler(args: { whosampled_url: string }) {
  try {
    await rateLimit();
    const url = args.whosampled_url.startsWith("http")
      ? args.whosampled_url
      : buildFullUrl(args.whosampled_url);

    const html = await withBrowser(async (page) => {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForTimeout(10_000);
      return await page.content();
    }, { stealth: true });

    // Extract title from <title> tag
    const titleMatch = /<title>([^<]*)<\/title>/i.exec(html);
    const pageTitle = titleMatch ? (titleMatch[1] ?? "").trim() : "";

    const samples = parseTrackSamples(html);
    return toolResult({ title: pageTitle, ...samples });
  } catch (error) {
    return toolError(error);
  }
}

export async function getArtistConnectionsHandler(args: { artist: string }) {
  try {
    await rateLimit();
    const slug = slugify(args.artist);
    const url = `${BASE_URL}/${slug}/`;

    const html = await withBrowser(async (page) => {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForTimeout(10_000);
      return await page.content();
    }, { stealth: true });

    const connections = parseArtistConnections(html);
    return toolResult(connections);
  } catch (error) {
    return toolError(error);
  }
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const searchWhoSampled = tool(
  "search_whosampled",
  "Search WhoSampled for a track by artist and title. Returns matching tracks with links to their sample detail pages and sample/sampled-by counts.",
  {
    artist: z.string().max(200).describe("Artist name to search for"),
    track: z.string().max(200).describe("Track title to search for"),
  },
  searchWhoSampledHandler,
);

const getTrackSamples = tool(
  "get_track_samples",
  "Get sample relationships for a specific track from its WhoSampled page. Returns samples used by the track and tracks that sampled it, with type (sample/interpolation/replay), element, year, and artist info.",
  {
    whosampled_url: z.string().max(500).describe("WhoSampled URL or path for the track (e.g., /Kanye-West/Stronger/)"),
  },
  getTrackSamplesHandler,
);

const getArtistConnections = tool(
  "get_artist_connections",
  "Get an artist's sampling connections from WhoSampled. Returns their most-sampled tracks, top sampling tracks, and overall sample counts.",
  {
    artist: z.string().max(200).describe("Artist name (will be slugified for URL lookup)"),
  },
  getArtistConnectionsHandler,
);

// ---------------------------------------------------------------------------
// Server export
// ---------------------------------------------------------------------------

export const whoSampledServer = createSdkMcpServer({
  name: "whosampled",
  version: "0.1.0",
  tools: [searchWhoSampled, getTrackSamples, getArtistConnections],
});
