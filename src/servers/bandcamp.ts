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
import RSSParser from "rss-parser";

const USER_AGENT = "Crate/1.0 (music-research-agent)";
const rssParser = new RSSParser();

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

const DISCOVER_URL = "https://bandcamp.com/api/discover/1/discover_web";

const SORT_MAP: Record<string, string> = {
  top: "pop",
  new: "date",
  rec: "rec",
};

// ---------------------------------------------------------------------------
// search_bandcamp handler
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Duration formatter
// ---------------------------------------------------------------------------

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

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


// ---------------------------------------------------------------------------
// get_artist_page handler
// ---------------------------------------------------------------------------

export async function getArtistPageHandler(args: { url: string }) {
  try {
    const html = await bandcampFetch(args.url);
    if (!html) throw new Error(`Failed to fetch artist page: ${args.url}`);

    const pagedata = extractPagedata(html);
    const $ = cheerio.load(html);

    const name = pagedata?.name ?? $("meta[property='og:title']").attr("content") ?? "Unknown";
    const location = $(".location").first().text().trim() || undefined;
    const bio = pagedata?.bio?.text || undefined;
    const bandId = pagedata?.band_id || undefined;
    const imageUrl = pagedata?.image_id
      ? `https://f4.bcbits.com/img/${pagedata.image_id}_0.jpg`
      : undefined;

    const discography = (pagedata?.discography ?? []).map((item: any) => ({
      title: item.title,
      url: item.page_url
        ? new URL(item.page_url, args.url).href
        : undefined,
      type: item.item_type === "album" ? "album" : "track",
      release_date: item.release_date || undefined,
      art_url: item.art_id
        ? `https://f4.bcbits.com/img/a${item.art_id}_0.jpg`
        : undefined,
    }));

    const links = (pagedata?.bandLinks ?? [])
      .map((l: any) => l.url)
      .filter(Boolean);

    // Try RSS feed for recent releases
    let recentFeed: any[] | undefined;
    try {
      const feedUrl = args.url.replace(/\/$/, "") + "/feed";
      const feedHtml = await bandcampFetch(feedUrl);
      if (feedHtml) {
        const feed = await rssParser.parseString(feedHtml);
        recentFeed = feed.items.slice(0, 10).map((item) => ({
          title: item.title ?? "",
          url: item.link ?? "",
          date: item.pubDate ?? "",
        }));
      }
    } catch {
      // RSS feed optional — silently skip on failure
    }

    return toolResult({
      name,
      url: args.url,
      ...(location && { location }),
      ...(bio && { bio }),
      ...(imageUrl && { image_url: imageUrl }),
      ...(bandId && { band_id: bandId }),
      discography,
      ...(links.length > 0 && { links }),
      ...(recentFeed && recentFeed.length > 0 && { recent_feed: recentFeed }),
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

const getArtistPage = tool(
  "get_artist_page",
  "Get full artist/label profile from their Bandcamp page. " +
    "Returns bio, location, discography, external links, and recent releases. " +
    "Requires the artist's Bandcamp URL (e.g. https://artist.bandcamp.com).",
  {
    url: z.string().url().describe("Artist's Bandcamp URL (e.g. https://artist.bandcamp.com)"),
  },
  getArtistPageHandler,
);

// ---------------------------------------------------------------------------
// get_album handler
// ---------------------------------------------------------------------------

export async function getAlbumHandler(args: { url: string }) {
  try {
    const html = await bandcampFetch(args.url);
    if (!html) throw new Error(`Failed to fetch album page: ${args.url}`);

    const pagedata = extractPagedata(html);
    const tralbum = extractTralbum(html);
    const $ = cheerio.load(html);

    const current = pagedata?.current ?? {};
    const title = current.title ?? $("meta[property='og:title']").attr("content") ?? "Unknown";
    const artist = current.artist ?? $("meta[property='og:site_name']").attr("content") ?? "Unknown";

    const tags: string[] = [];
    $("a.tag").each((_, el) => {
      const tag = $(el).text().trim();
      if (tag) tags.push(tag);
    });

    const label = $(".label a").first().text().trim() || undefined;
    const artUrl = pagedata?.art_id
      ? `https://f4.bcbits.com/img/a${pagedata.art_id}_0.jpg`
      : undefined;

    const tracks = (tralbum?.trackinfo ?? []).map((t: any) => ({
      number: t.track_num,
      title: t.title,
      ...(t.duration != null && {
        duration_seconds: t.duration,
        duration_formatted: formatDuration(t.duration),
      }),
      ...(t.artist && { artist: t.artist }),
    }));

    const price =
      current.minimum_price != null && current.currency
        ? { amount: current.minimum_price, currency: current.currency }
        : undefined;

    return toolResult({
      title,
      artist,
      url: args.url,
      ...(current.release_date && { release_date: current.release_date }),
      ...(artUrl && { art_url: artUrl }),
      ...(current.about && { about: current.about }),
      ...(current.credits && { credits: current.credits }),
      tags,
      ...(label && { label }),
      ...(price && { price }),
      tracks,
    });
  } catch (error) {
    return toolError(error);
  }
}

const getAlbum = tool(
  "get_album",
  "Get full album details from a Bandcamp album page. " +
    "Returns tracklist with durations, tags, credits, label, and pricing. " +
    "Requires the album's Bandcamp URL.",
  {
    url: z.string().url().describe("Album URL (e.g. https://artist.bandcamp.com/album/title)"),
  },
  getAlbumHandler,
);

// ---------------------------------------------------------------------------
// discover_music handler
// ---------------------------------------------------------------------------

export async function discoverMusicHandler(args: {
  tag: string;
  sort?: "top" | "new" | "rec";
  format?: "vinyl" | "cd" | "cassette" | "digital";
  location?: number;
}) {
  try {
    const sort = SORT_MAP[args.sort ?? "top"] ?? "pop";
    let url = `${DISCOVER_URL}?tag=${encodeURIComponent(args.tag)}&sort=${sort}`;
    if (args.format) url += `&format=${encodeURIComponent(args.format)}`;
    if (args.location) url += `&geoname_id=${args.location}`;

    const body = await bandcampFetch(url);
    if (!body) throw new Error(`Failed to fetch Bandcamp discover results for tag: ${args.tag}`);

    const json = JSON.parse(body);
    const items = (json.items ?? []).map((item: any) => {
      const hints = item.url_hints ?? {};
      const subdomain = hints.custom_domain ?? `${hints.slug}.bandcamp.com`;
      const itemUrl = hints.item_type === "a"
        ? `https://${subdomain}/album/${hints.item_slug}`
        : `https://${subdomain}/track/${hints.item_slug}`;

      return {
        title: item.primary_text,
        artist: item.secondary_text,
        url: itemUrl,
        ...(item.art_id && { art_url: `https://f4.bcbits.com/img/a${item.art_id}_0.jpg` }),
        ...(item.genre_text && { genre: item.genre_text }),
        ...(item.release_date && { release_date: item.release_date }),
      };
    });

    return toolResult({
      tag: args.tag,
      sort: args.sort ?? "top",
      result_count: items.length,
      items,
    });
  } catch (error) {
    return toolError(error);
  }
}

const discoverMusic = tool(
  "discover_music",
  "Browse Bandcamp's discovery system by genre/tag. " +
    "Returns trending and new releases for a tag with optional sort and format filters. " +
    "Great for finding new independent music by genre.",
  {
    tag: z.string().describe("Genre tag (e.g. 'ambient', 'hip-hop-rap', 'post-punk')"),
    sort: z.enum(["top", "new", "rec"]).optional().describe("Sort order (default: top)"),
    format: z.enum(["vinyl", "cd", "cassette", "digital"]).optional().describe("Physical format filter"),
    location: z.number().optional().describe("GeoNames ID for location filter"),
  },
  discoverMusicHandler,
);

// ---------------------------------------------------------------------------
// Server export
// ---------------------------------------------------------------------------

export const bandcampServer = createSdkMcpServer({
  name: "bandcamp",
  version: "1.0.0",
  tools: [searchBandcamp, getArtistPage, getAlbum, discoverMusic],
});
