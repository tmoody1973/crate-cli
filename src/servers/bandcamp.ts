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

export async function bandcampFetch(url: string, options?: { method?: string; body?: unknown }): Promise<string | null> {
  try {
    await rateLimit();
    const headers: Record<string, string> = { "User-Agent": USER_AGENT };
    const init: RequestInit = { headers };
    if (options?.method) init.method = options.method;
    if (options?.body != null) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }
    const resp = await fetch(url, init);
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Location Resolver (city name → GeoNames ID)
// ---------------------------------------------------------------------------

const GEONAME_SEARCH_URL = "https://bandcamp.com/api/location/1/geoname_search";

export interface GeonameResult {
  id: number;
  name: string;
  fullname: string;
}

export async function resolveLocation(query: string): Promise<GeonameResult[]> {
  const body = await bandcampFetch(GEONAME_SEARCH_URL, {
    method: "POST",
    body: { q: query, n: 5, geocoder_fallback: true },
  });
  if (!body) return [];
  try {
    const json = JSON.parse(body);
    if (!json.ok) return [];
    return (json.results ?? []).map((r: any) => ({
      id: Number(r.id),
      name: r.name,
      fullname: r.fullname,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Pagedata Extractor
// ---------------------------------------------------------------------------

/** Decode common HTML entities in a string. */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'");
}

export function extractPagedata(html: string): any | null {
  const match = html.match(/id="pagedata"\s+data-blob="([^"]*)"/);
  if (!match?.[1]) return null;
  try {
    // Bandcamp uses HTML-entity-encoded JSON in data-blob
    return JSON.parse(decodeHtmlEntities(match[1]));
  } catch {
    // Fallback: some pages may use URL encoding
    try {
      return JSON.parse(decodeURIComponent(match[1]));
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Tralbum Extractor
// ---------------------------------------------------------------------------

export function extractTralbum(html: string): any | null {
  // Try single-quoted attribute first (raw JSON)
  const sq = html.match(/data-tralbum='([^']*)'/);
  if (sq?.[1]) {
    try {
      return JSON.parse(sq[1]);
    } catch { /* fall through */ }
  }
  // Try double-quoted attribute (HTML-entity-encoded JSON)
  const dq = html.match(/data-tralbum="([^"]*)"/);
  if (dq?.[1]) {
    try {
      return JSON.parse(decodeHtmlEntities(dq[1]));
    } catch { /* fall through */ }
  }
  return null;
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
  location?: string;
}) {
  try {
    let url = `https://bandcamp.com/search?q=${encodeURIComponent(args.query)}`;
    if (args.item_type && ITEM_TYPE_MAP[args.item_type]) {
      url += `&item_type=${ITEM_TYPE_MAP[args.item_type]}`;
    }
    if (args.location) {
      url += `&location=${encodeURIComponent(args.location)}`;
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
    const bio = pagedata?.bio?.text || $(".signed-out-artists-bio-text .bio-text").text().trim() || undefined;
    const bandId = pagedata?.band_id || undefined;
    const imageUrl = pagedata?.image_id
      ? `https://f4.bcbits.com/img/${pagedata.image_id}_0.jpg`
      : $(".band-photo").attr("src") || undefined;

    // Try pagedata first, then fall back to DOM scraping
    let discography = (pagedata?.discography ?? []).map((item: any) => ({
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

    // DOM fallback: scrape #music-grid when pagedata has no discography
    if (discography.length === 0) {
      $("#music-grid li").each((_, el) => {
        const $el = $(el);
        const href = $el.find("a").first().attr("href");
        const title = $el.find("p.title").text().trim();
        const imgSrc = $el.find("img").attr("src") ?? "";
        const artUrl = imgSrc && !imgSrc.endsWith("/0.gif") ? imgSrc : undefined;
        const isTrack = href?.includes("/track/");

        if (title && href) {
          discography.push({
            title,
            url: new URL(href, args.url).href,
            type: isTrack ? "track" : "album",
            release_date: undefined,
            ...(artUrl && { art_url: artUrl }),
          });
        }
      });
    }

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
    "Supports location filtering to find artists from a specific city or region. " +
    "Use for finding independent artists and releases on Bandcamp.",
  {
    query: z.string().describe("Search terms (e.g. 'Boards of Canada', 'lo-fi hip hop')"),
    item_type: z
      .enum(["artist", "album", "track", "label"])
      .optional()
      .describe("Filter by type (default: all types)"),
    location: z
      .string()
      .optional()
      .describe("Filter results by city/region (e.g. 'Milwaukee', 'Chicago', 'Detroit')"),
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

const FORMAT_MAP: Record<string, number> = {
  digital: 1, vinyl: 2, cd: 3, cassette: 4,
};

export async function discoverMusicHandler(args: {
  tag: string;
  sort?: "top" | "new" | "rec";
  format?: "vinyl" | "cd" | "cassette" | "digital";
  location?: string;
}) {
  try {
    // Resolve location string → GeoNames ID
    let geonameId = 0;
    let resolvedLocation: string | undefined;
    if (args.location) {
      const results = await resolveLocation(args.location);
      if (results.length > 0) {
        geonameId = results[0]!.id;
        resolvedLocation = results[0]!.fullname;
      }
    }

    const slice = SORT_MAP[args.sort ?? "top"] ?? "pop";

    const payload: Record<string, unknown> = {
      tag_norm_names: [args.tag],
      slice,
      cursor: "*",
      size: 60,
      include_result_types: ["a", "s"],
      geoname_id: geonameId,
      category_id: args.format ? (FORMAT_MAP[args.format] ?? 0) : 0,
      time_facet_id: null,
    };

    const body = await bandcampFetch(DISCOVER_URL, { method: "POST", body: payload });
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
        ...(item.featured_track?.band_location && { location: item.featured_track.band_location }),
        ...(item.art_id && { art_url: `https://f4.bcbits.com/img/a${item.art_id}_0.jpg` }),
        ...(item.genre_text && { genre: item.genre_text }),
        ...(item.release_date && { release_date: item.release_date }),
      };
    });

    return toolResult({
      tag: args.tag,
      sort: args.sort ?? "top",
      ...(resolvedLocation && { location: resolvedLocation, geoname_id: geonameId }),
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
    "Supports location filtering by city name (e.g. 'Milwaukee', 'Detroit', 'Berlin'). " +
    "Use this for discovering local music scenes.",
  {
    tag: z.string().describe("Genre tag (e.g. 'ambient', 'hip-hop-rap', 'post-punk')"),
    sort: z.enum(["top", "new", "rec"]).optional().describe("Sort order (default: top)"),
    format: z.enum(["vinyl", "cd", "cassette", "digital"]).optional().describe("Physical format filter"),
    location: z.string().optional().describe("City or region name for location filter (e.g. 'Milwaukee', 'Detroit', 'London')"),
  },
  discoverMusicHandler,
);

// ---------------------------------------------------------------------------
// get_tag_info handler
// ---------------------------------------------------------------------------

export async function getTagInfoHandler(args: { tag: string }) {
  try {
    const url = `https://bandcamp.com/tag/${encodeURIComponent(args.tag)}`;
    const html = await bandcampFetch(url);
    if (!html) throw new Error(`Failed to fetch tag page: ${args.tag}`);

    const pagedata = extractPagedata(html);
    const hub = pagedata?.hub ?? {};

    const relatedTags = (hub.related_tags ?? [])
      .map((t: any) => t.tag_norm_name)
      .filter(Boolean);

    return toolResult({
      tag: args.tag,
      ...(hub.description && { description: hub.description }),
      related_tags: relatedTags,
    });
  } catch (error) {
    return toolError(error);
  }
}

const getTagInfo = tool(
  "get_tag_info",
  "Get information about a Bandcamp genre/tag. " +
    "Returns tag description and related tags. " +
    "Use to explore the genre taxonomy and find related styles.",
  {
    tag: z.string().describe("Genre tag (e.g. 'ambient', 'hip-hop-rap', 'post-punk')"),
  },
  getTagInfoHandler,
);

// ---------------------------------------------------------------------------
// get_bandcamp_editorial handler
// ---------------------------------------------------------------------------

const EDITORIAL_CATEGORIES = [
  "features", "lists", "album-of-the-day", "essential-releases",
  "big-ups", "scene-report", "label-profile", "the-merch-table",
] as const;

export async function getBandcampEditorialHandler(args: {
  url?: string;
  category?: string;
}) {
  try {
    // Read mode: fetch and parse a specific article
    if (args.url) {
      if (!args.url.startsWith("https://daily.bandcamp.com/")) {
        throw new Error("URL must be a Bandcamp Daily article (https://daily.bandcamp.com/...)");
      }

      const html = await bandcampFetch(args.url);
      if (!html) throw new Error(`Failed to fetch article: ${args.url}`);

      const $ = cheerio.load(html);

      // Metadata — og:title and article:published_time are reliable;
      // author lives in JSON-LD structured data
      const title = $("meta[property='og:title']").attr("content")
        || $("article h1").first().text().trim()
        || "Unknown";
      const date = $("meta[property='article:published_time']").attr("content")
        || undefined;

      let author: string | undefined;
      try {
        const ldJson = $("script[type='application/ld+json']").first().html();
        if (ldJson) {
          const ld = JSON.parse(ldJson);
          author = ld.author?.name ?? undefined;
        }
      } catch { /* JSON-LD optional */ }

      // Body text from article paragraphs
      const paragraphs: string[] = [];
      $("article p").each((_, el) => {
        const text = $(el).text().trim();
        if (text) paragraphs.push(text);
      });
      let bodyText = paragraphs.join("\n\n");
      if (bodyText.length > 4000) {
        bodyText = bodyText.slice(0, 4000) + " [truncated]";
      }

      // Extract referenced Bandcamp releases
      const releaseMap = new Map<string, { url: string; title: string; artist?: string }>();

      // From inline links
      $("a[href*='bandcamp.com/album/'], a[href*='bandcamp.com/track/']").each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return;
        const cleanUrl = href.split("?")[0]?.split("#")[0] ?? href;
        if (!releaseMap.has(cleanUrl)) {
          releaseMap.set(cleanUrl, {
            url: cleanUrl,
            title: $(el).text().trim() || "Unknown",
          });
        }
      });

      // From player embeds — .mptralbum is an <a> with the album URL
      $(".mpalbuminfo").each((_, el) => {
        const $info = $(el);
        const $tralbum = $info.find(".mptralbum");
        const $artist = $info.find(".mpartist");
        const albumTitle = $tralbum.text().trim();
        const artistName = $artist.text().trim();
        const albumUrl = $tralbum.attr("href")
          ?? $info.closest("a[href*='bandcamp.com']").attr("href");

        if (albumUrl) {
          const cleanUrl = albumUrl.split("?")[0]?.split("#")[0] ?? albumUrl;
          const existing = releaseMap.get(cleanUrl);
          if (existing) {
            // Player embed data is more structured — always prefer it
            if (artistName) existing.artist = artistName;
            if (albumTitle) existing.title = albumTitle;
          } else {
            releaseMap.set(cleanUrl, {
              url: cleanUrl,
              title: albumTitle || "Unknown",
              ...(artistName && { artist: artistName }),
            });
          }
        }
      });

      const releases = Array.from(releaseMap.values());

      return toolResult({
        title,
        url: args.url,
        ...(author && { author }),
        ...(date && { date }),
        body_text: bodyText,
        releases,
        release_count: releases.length,
      });
    }

    // Browse mode: list recent articles from RSS feed
    const feedHtml = await bandcampFetch("https://daily.bandcamp.com/feed");
    if (!feedHtml) throw new Error("Failed to fetch Bandcamp Daily RSS feed");

    const feed = await rssParser.parseString(feedHtml);
    let articles = feed.items.map((item) => ({
      title: item.title ?? "",
      url: item.link ?? "",
      date: item.isoDate ?? item.pubDate ?? "",
      author: item.creator ?? undefined,
      category: item.categories?.[0] ?? undefined,
    }));

    if (args.category) {
      articles = articles.filter((a) =>
        a.category?.toLowerCase() === args.category!.toLowerCase()
        || a.url.includes(`/${args.category}/`)
      );
    }

    return toolResult({
      source: "Bandcamp Daily",
      article_count: articles.length,
      ...(args.category && { category: args.category }),
      articles,
    });
  } catch (error) {
    return toolError(error);
  }
}

const getBandcampEditorial = tool(
  "get_bandcamp_editorial",
  "Access Bandcamp Daily editorial content — album reviews, features, interviews, and curated lists. " +
    "Without a URL: browse recent articles, optionally filtered by category. " +
    "With a URL: read the full article with all referenced Bandcamp releases extracted.",
  {
    url: z.string().url().optional()
      .describe("Bandcamp Daily article URL to read. Omit to browse recent articles."),
    category: z.enum(EDITORIAL_CATEGORIES).optional()
      .describe("Filter browse results by category (ignored when url is provided)"),
  },
  getBandcampEditorialHandler,
);

// ---------------------------------------------------------------------------
// Server export
// ---------------------------------------------------------------------------

export const bandcampServer = createSdkMcpServer({
  name: "bandcamp",
  version: "1.0.0",
  tools: [searchBandcamp, getArtistPage, getAlbum, discoverMusic, getTagInfo, getBandcampEditorial],
});
