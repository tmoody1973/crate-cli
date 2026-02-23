// src/servers/radio.ts
/**
 * Radio Browser MCP server — live internet radio via radio-browser.info API.
 *
 * 4 tools:
 *   1. search_radio — Search stations by name, tag, country, language
 *   2. browse_radio — Browse top stations by tag/country
 *   3. get_radio_tags — List popular genre/style tags
 *   4. play_radio — Stream a live radio station via mpv
 */

import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import {
  spawnMpv,
  registerCleanup,
  requireBinary,
  toolResult,
  toolError,
  player,
  SOCKET_WAIT_MS,
  type ToolResult,
} from "../utils/player.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_MIRRORS = [
  "https://de1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
  "https://fr1.api.radio-browser.info",
];

const USER_AGENT = "Crate/0.5.0";
const FETCH_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// API Helpers
// ---------------------------------------------------------------------------

async function radioFetch(path: string): Promise<any> {
  let lastError: Error | null = null;

  for (const base of API_MIRRORS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      let resp: Response;
      try {
        resp = await fetch(`${base}${path}`, {
          headers: {
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (!resp.ok) {
        lastError = new Error(`Radio Browser API error: ${resp.status}`);
        continue;
      }
      return await resp.json();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error("All Radio Browser API mirrors failed");
}

interface StationResult {
  name: string;
  url: string;
  url_resolved: string;
  tags: string;
  country: string;
  language: string;
  codec: string;
  bitrate: number;
  votes: number;
  favicon: string;
}

function formatStation(s: StationResult) {
  return {
    name: s.name?.trim() || "Unknown Station",
    stream_url: s.url_resolved || s.url,
    tags: s.tags ? s.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : [],
    country: s.country || undefined,
    language: s.language || undefined,
    codec: s.codec || undefined,
    bitrate: s.bitrate || undefined,
    votes: s.votes ?? 0,
    ...(s.favicon ? { favicon: s.favicon } : {}),
  };
}

// ---------------------------------------------------------------------------
// search_radio handler
// ---------------------------------------------------------------------------

async function searchRadioHandler(args: {
  query: string;
  tag?: string;
  country?: string;
  language?: string;
  limit?: number;
}): Promise<ToolResult> {
  try {
    const limit = Math.min(args.limit ?? 10, 50);
    const params = new URLSearchParams({
      name: args.query,
      limit: String(limit),
      order: "votes",
      reverse: "true",
      hidebroken: "true",
    });
    if (args.tag) params.set("tag", args.tag);
    if (args.country) params.set("country", args.country);
    if (args.language) params.set("language", args.language);

    const stations: StationResult[] = await radioFetch(`/json/stations/search?${params}`);
    const results = stations.map(formatStation);

    return toolResult({
      query: args.query,
      result_count: results.length,
      results,
    });
  } catch (error) {
    return toolError(error);
  }
}

// ---------------------------------------------------------------------------
// browse_radio handler
// ---------------------------------------------------------------------------

async function browseRadioHandler(args: {
  tag?: string;
  country?: string;
  order?: string;
  limit?: number;
}): Promise<ToolResult> {
  try {
    const limit = Math.min(args.limit ?? 10, 50);
    const order = args.order ?? "votes";

    let path: string;
    if (args.tag) {
      const params = new URLSearchParams({
        limit: String(limit),
        order,
        reverse: "true",
        hidebroken: "true",
      });
      path = `/json/stations/bytag/${encodeURIComponent(args.tag)}?${params}`;
    } else if (args.country) {
      const params = new URLSearchParams({
        limit: String(limit),
        order,
        reverse: "true",
        hidebroken: "true",
      });
      path = `/json/stations/bycountry/${encodeURIComponent(args.country)}?${params}`;
    } else {
      const params = new URLSearchParams({
        limit: String(limit),
        hidebroken: "true",
      });
      path = `/json/stations/topvote?${params}`;
    }

    const stations: StationResult[] = await radioFetch(path);
    const results = stations.map(formatStation);

    return toolResult({
      browse: args.tag ?? args.country ?? "top",
      result_count: results.length,
      results,
    });
  } catch (error) {
    return toolError(error);
  }
}

// ---------------------------------------------------------------------------
// get_radio_tags handler
// ---------------------------------------------------------------------------

async function getRadioTagsHandler(args: {
  limit?: number;
}): Promise<ToolResult> {
  try {
    const limit = Math.min(args.limit ?? 50, 200);
    const params = new URLSearchParams({
      order: "stationcount",
      reverse: "true",
      limit: String(limit),
    });

    const tags: Array<{ name: string; stationcount: number }> = await radioFetch(`/json/tags?${params}`);
    const results = tags.map((t) => ({
      tag: t.name,
      station_count: t.stationcount,
    }));

    return toolResult({
      tag_count: results.length,
      tags: results,
    });
  } catch (error) {
    return toolError(error);
  }
}

// ---------------------------------------------------------------------------
// play_radio handler
// ---------------------------------------------------------------------------

async function playRadioHandler(args: {
  url?: string;
  name?: string;
}): Promise<ToolResult> {
  try {
    if (!args.url && !args.name) {
      throw new Error("Provide either a stream URL or a station name to play.");
    }

    requireBinary("mpv");
    registerCleanup();

    let streamUrl: string;
    let stationName: string;

    if (args.url) {
      const parsed = new URL(args.url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Stream URL must use HTTP or HTTPS.");
      }
      streamUrl = args.url;
      stationName = args.name ?? "Radio";
    } else {
      // Search for the station by name and pick the best match
      const params = new URLSearchParams({
        name: args.name!,
        limit: "1",
        order: "votes",
        reverse: "true",
        hidebroken: "true",
      });

      const stations: StationResult[] = await radioFetch(`/json/stations/search?${params}`);
      if (stations.length === 0) {
        throw new Error(`No radio station found matching "${args.name}".`);
      }

      const station = stations[0]!;
      streamUrl = station.url_resolved || station.url;
      const parsed = new URL(streamUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Station stream URL must use HTTP or HTTPS.");
      }
      stationName = station.name?.trim() || args.name!;
    }

    // Spawn mpv directly with the stream URL (no yt-dlp needed for radio)
    spawnMpv(streamUrl, ["--ytdl=no"]);

    player.currentTrack = {
      title: stationName,
      url: streamUrl,
    };
    player.isPlaylist = false;
    player.isRadio = true;
    player.stationName = stationName;

    // Wait for socket to be created
    await new Promise((resolve) => setTimeout(resolve, SOCKET_WAIT_MS));

    return toolResult({
      status: "streaming",
      station: stationName,
      stream_url: streamUrl,
    });
  } catch (error) {
    return toolError(error);
  }
}

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------

const searchRadio = tool(
  "search_radio",
  "Search internet radio stations by name, genre tag, country, or language. " +
    "Returns station name, stream URL, tags, country, codec, bitrate, and votes.",
  {
    query: z.string().max(200).describe("Search terms (e.g. 'jazz', 'KEXP', 'BBC Radio')"),
    tag: z.string().max(100).optional().describe("Filter by genre tag (e.g. 'jazz', 'electronic', 'hip hop')"),
    country: z.string().max(100).optional().describe("Filter by country name (e.g. 'United States', 'Germany', 'Japan')"),
    language: z.string().max(100).optional().describe("Filter by language (e.g. 'english', 'spanish', 'french')"),
    limit: z.number().min(1).max(50).optional().describe("Number of results (default: 10, max: 50)"),
  },
  searchRadioHandler,
);

const browseRadio = tool(
  "browse_radio",
  "Browse top radio stations by genre tag or country, sorted by popularity. " +
    "Without filters, returns the globally most popular stations.",
  {
    tag: z.string().max(100).optional().describe("Browse stations with this genre tag"),
    country: z.string().max(100).optional().describe("Browse stations from this country"),
    order: z.enum(["votes", "clickcount", "name"]).optional().describe("Sort order (default: votes)"),
    limit: z.number().min(1).max(50).optional().describe("Number of results (default: 10, max: 50)"),
  },
  browseRadioHandler,
);

const getRadioTags = tool(
  "get_radio_tags",
  "List popular radio genre and style tags with station counts. " +
    "Use to discover available genres before searching or browsing.",
  {
    limit: z.number().min(1).max(200).optional().describe("Number of tags to return (default: 50, max: 200)"),
  },
  getRadioTagsHandler,
);

const playRadio = tool(
  "play_radio",
  "Stream a live radio station via mpv. " +
    "Provide a stream URL directly, or a station name to search and play the best match. " +
    "Player controls (pause, volume, stop) work via player_control.",
  {
    url: z.string().max(500).optional().describe("Direct stream URL to play"),
    name: z.string().max(200).optional().describe("Station name to search and play (e.g. 'KEXP', 'NTS Radio')"),
  },
  playRadioHandler,
);

// ---------------------------------------------------------------------------
// Server Export
// ---------------------------------------------------------------------------

export const radioServer = createSdkMcpServer({
  name: "radio",
  version: "1.0.0",
  tools: [searchRadio, browseRadio, getRadioTags, playRadio],
});
