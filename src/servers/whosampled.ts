// src/servers/whosampled.ts
/**
 * WhoSampled MCP server — sample relationship metadata extraction.
 *
 * Content signal analysis:
 *   - search: yes (site is publicly searchable)
 *   - ai-train: no (respecting robots.txt ai-train directive)
 *   - ai-input: unspecified
 *   - Extraction scope: metadata only (artist, track, year, type, element, URL)
 *   - No editorial content is extracted
 *
 * Uses Kernel.sh headless browser via withBrowser helper to navigate
 * WhoSampled pages and extract structured sample relationship data.
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
 * Looks for track entries with links to track pages and artist info.
 */
export function parseSearchResults(html: string): SearchResult[] {
  const results: SearchResult[] = [];

  // Match track entries: links like /Artist/Track/ with track name and artist info
  const trackPattern =
    /<a\s+[^>]*href="(\/[^"]+\/[^"]+\/)"[^>]*>\s*([^<]+)<\/a>/gi;
  const artistPattern =
    /<span[^>]*class="[^"]*artist[^"]*"[^>]*>\s*(?:<a[^>]*>)?\s*([^<]+)\s*(?:<\/a>)?\s*<\/span>/gi;

  // Extract entries that look like search result items
  const entryPattern =
    /<div[^>]*class="[^"]*(?:trackName|listEntry|searchResult|result)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;

  let entryMatch: RegExpExecArray | null;
  while ((entryMatch = entryPattern.exec(html)) !== null) {
    const block = entryMatch[1] ?? "";

    trackPattern.lastIndex = 0;
    const linkMatch = trackPattern.exec(block);
    if (!linkMatch) continue;

    const href = linkMatch[1] ?? "";
    const trackName = (linkMatch[2] ?? "").trim();

    artistPattern.lastIndex = 0;
    const artistMatch = artistPattern.exec(block);
    const artistName = artistMatch ? (artistMatch[1] ?? "").trim() : "";

    // Try to extract sample counts
    const countPattern = /(\d+)\s*sample/gi;
    const sampledByPattern = /sampled\s*(?:by\s*)?(\d+)/gi;

    countPattern.lastIndex = 0;
    const countMatch = countPattern.exec(block);
    sampledByPattern.lastIndex = 0;
    const sampledByMatch = sampledByPattern.exec(block);

    results.push({
      track: trackName,
      artist: artistName,
      whosampled_url: buildFullUrl(href),
      ...(countMatch ? { sample_count: parseInt(countMatch[1] ?? "0", 10) } : {}),
      ...(sampledByMatch ? { sampled_by_count: parseInt(sampledByMatch[1] ?? "0", 10) } : {}),
    });
  }

  return results;
}

/**
 * Parse track sample relationships from a WhoSampled track page HTML.
 * Extracts "samples used" (what this track sampled) and "sampled by" (who sampled this).
 */
export function parseTrackSamples(html: string): TrackSamples {
  const samples_used: SampleEntry[] = [];
  const sampled_by: SampleEntry[] = [];

  // Split into sections — look for "Contains samples" and "Was sampled" headings
  const sectionPattern =
    /<(?:h[1-6]|div|section)[^>]*[^>]*>([\s\S]*?)(?=<(?:h[1-6]|div|section)[^>]*class|$)/gi;

  // Parse individual sample entries from a section
  function extractEntries(sectionHtml: string): SampleEntry[] {
    const entries: SampleEntry[] = [];
    // Match entries with track link + artist + optional year
    const entryPattern =
      /<a\s+[^>]*href="(\/[^"]+)"[^>]*>\s*([^<]+)<\/a>/gi;

    let match: RegExpExecArray | null;
    while ((match = entryPattern.exec(sectionHtml)) !== null) {
      const href = match[1] ?? "";
      const title = (match[2] ?? "").trim();

      // Skip navigation/non-track links
      if (!href.includes("/") || href === "/" || title.length < 2) continue;
      // Filter to track-like hrefs (at least 2 path segments)
      const segments = href.split("/").filter(Boolean);
      if (segments.length < 2) continue;

      // Find nearby artist name
      const afterMatch = sectionHtml.slice((match.index ?? 0) + (match[0]?.length ?? 0), (match.index ?? 0) + (match[0]?.length ?? 0) + 300);
      const artistInEntry = /<span[^>]*>\s*(?:by\s+)?([^<]+)<\/span>/i.exec(afterMatch);
      const artist = artistInEntry ? (artistInEntry[1] ?? "").trim() : "";

      // Find year
      const yearMatch = /\b((?:19|20)\d{2})\b/.exec(afterMatch);
      const year = yearMatch ? parseInt(yearMatch[1] ?? "0", 10) : undefined;

      // Find element type (e.g., "Vocals / Lyrics", "Drums", "Hook / Riff")
      const elementMatch = /(?:element|genre|part)s?\s*[:>]\s*([^<]+)/i.exec(afterMatch);
      const element = elementMatch ? (elementMatch[1] ?? "").trim() : undefined;

      // Determine type from surrounding context
      const contextBlock = sectionHtml.slice(
        Math.max(0, (match.index ?? 0) - 200),
        (match.index ?? 0) + (match[0]?.length ?? 0) + 200,
      );
      const type = classifySampleType(contextBlock);

      entries.push({
        title,
        artist,
        ...(year !== undefined ? { year } : {}),
        type,
        ...(element ? { element } : {}),
        whosampled_url: buildFullUrl(href),
      });
    }

    return entries;
  }

  // Look for "Contains samples" / "samples of" section
  const samplesUsedPattern =
    /(?:contains\s+samples?\s+of|samples?\s+of|sampled)([\s\S]*?)(?=(?:was\s+sampled|sampled\s+by|$))/i;
  const samplesUsedMatch = samplesUsedPattern.exec(html);
  if (samplesUsedMatch) {
    const section = samplesUsedMatch[1] ?? "";
    samples_used.push(...extractEntries(section));
  }

  // Look for "Was sampled by" / "Sampled by" section
  const sampledByPattern =
    /(?:was\s+sampled\s+(?:in|by)|sampled\s+by)([\s\S]*?)(?=(?:contains\s+samples|cover\s+versions|$))/i;
  const sampledByMatch = sampledByPattern.exec(html);
  if (sampledByMatch) {
    const section = sampledByMatch[1] ?? "";
    sampled_by.push(...extractEntries(section));
  }

  return { samples_used, sampled_by };
}

/**
 * Parse artist connections from a WhoSampled artist page HTML.
 * Extracts top sampled tracks and top sampling tracks with counts.
 */
export function parseArtistConnections(html: string): ArtistConnections {
  const top_sampled_tracks: ArtistTopTrack[] = [];
  const top_sampling_tracks: ArtistTopTrack[] = [];

  // Extract total counts from artist page
  const totalSamplesUsed = /(\d+)\s*samples?\s*(?:used|of)/i.exec(html);
  const totalSampledBy = /sampled\s*(?:by\s*)?(\d+)/i.exec(html);

  // Parse track entries with sample counts
  function extractTopTracks(sectionHtml: string): ArtistTopTrack[] {
    const tracks: ArtistTopTrack[] = [];
    const trackPattern =
      /<a\s+[^>]*href="(\/[^"]+\/[^"]+\/)"[^>]*>\s*([^<]+)<\/a>/gi;

    let match: RegExpExecArray | null;
    while ((match = trackPattern.exec(sectionHtml)) !== null) {
      const href = match[1] ?? "";
      const trackName = (match[2] ?? "").trim();
      if (trackName.length < 2) continue;

      // Look for count near this entry
      const afterMatch = sectionHtml.slice(
        (match.index ?? 0) + (match[0]?.length ?? 0),
        (match.index ?? 0) + (match[0]?.length ?? 0) + 200,
      );
      const countMatch = /(\d+)\s*(?:sample|connection|entr)/i.exec(afterMatch);
      const count = countMatch ? parseInt(countMatch[1] ?? "0", 10) : 0;

      tracks.push({
        track: trackName,
        sample_count: count,
        whosampled_url: buildFullUrl(href),
      });
    }

    return tracks;
  }

  // Sampled tracks section (tracks that sample others)
  const samplingSection =
    /(?:top\s+sampl(?:ing|ed)\s+track|tracks?\s+that\s+sampl(?:e|ed))([\s\S]*?)(?=(?:top\s+sampled|most\s+sampled|$))/i;
  const samplingSectionMatch = samplingSection.exec(html);
  if (samplingSectionMatch) {
    top_sampling_tracks.push(...extractTopTracks(samplingSectionMatch[1] ?? ""));
  }

  // Most sampled tracks section (tracks sampled by others)
  const sampledSection =
    /(?:most\s+sampled\s+track|top\s+sampled\s+track|tracks?\s+sampled\s+by)([\s\S]*?)(?=(?:top\s+sampling|tracks?\s+that\s+sample|$))/i;
  const sampledSectionMatch = sampledSection.exec(html);
  if (sampledSectionMatch) {
    top_sampled_tracks.push(...extractTopTracks(sampledSectionMatch[1] ?? ""));
  }

  return {
    ...(totalSamplesUsed ? { total_samples_used: parseInt(totalSamplesUsed[1] ?? "0", 10) } : {}),
    ...(totalSampledBy ? { total_sampled_by: parseInt(totalSampledBy[1] ?? "0", 10) } : {}),
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
      await page.waitForTimeout(2000);
      return await page.content();
    });

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
      await page.waitForTimeout(2000);
      return await page.content();
    });

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
      await page.waitForTimeout(2000);
      return await page.content();
    });

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
