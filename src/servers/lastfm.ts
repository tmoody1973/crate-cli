// src/servers/lastfm.ts
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const BASE_URL = "https://ws.audioscrobbler.com/2.0/";
const RATE_LIMIT_MS = 200; // 5 req/sec
const FETCH_TIMEOUT_MS = 15_000;

let lastRequest = 0;

export async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequest;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
  lastRequest = Date.now();
}

export async function lastfmFetch(
  method: string,
  params?: Record<string, string>,
): Promise<any> {
  await rateLimit();

  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) {
    throw new Error("LASTFM_API_KEY is required");
  }

  const url = new URL(BASE_URL);
  url.searchParams.set("method", method);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Crate-CLI/1.0 (music-research-agent)",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`Last.fm API error: ${res.status}`);
  }

  const json = await res.json();

  // Last.fm returns HTTP 200 with error field on failures
  if (json.error) {
    throw new Error(`Last.fm: ${json.message ?? `error code ${json.error}`}`);
  }

  return json;
}

type ToolResult = { content: [{ type: "text"; text: string }] };

function toolResult(data: unknown): ToolResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }] };
}

// --- Handler functions (exported for testing) ---

export async function getArtistInfoHandler(args: {
  artist: string;
  username?: string;
}) {
  try {
    const params: Record<string, string> = {
      artist: args.artist,
      autocorrect: "1",
    };
    if (args.username) params.username = args.username;

    const data = await lastfmFetch("artist.getInfo", params);
    const a = data.artist;
    return toolResult({
      name: a.name,
      mbid: a.mbid || null,
      url: a.url,
      listeners: Number(a.stats?.listeners ?? 0),
      playcount: Number(a.stats?.playcount ?? 0),
      userplaycount: a.stats?.userplaycount ? Number(a.stats.userplaycount) : null,
      tags: (a.tags?.tag ?? []).map((t: any) => t.name),
      similar: (a.similar?.artist ?? []).map((s: any) => ({
        name: s.name,
        url: s.url,
      })),
      bio_summary: a.bio?.summary?.replace(/<[^>]*>/g, "").trim() ?? null,
    });
  } catch (error) {
    return toolError(error);
  }
}

export async function getAlbumInfoHandler(args: {
  artist: string;
  album: string;
  username?: string;
}) {
  try {
    const params: Record<string, string> = {
      artist: args.artist,
      album: args.album,
      autocorrect: "1",
    };
    if (args.username) params.username = args.username;

    const data = await lastfmFetch("album.getInfo", params);
    const a = data.album;
    return toolResult({
      name: a.name,
      artist: a.artist,
      mbid: a.mbid || null,
      url: a.url,
      listeners: Number(a.listeners ?? 0),
      playcount: Number(a.playcount ?? 0),
      userplaycount: a.userplaycount ? Number(a.userplaycount) : null,
      tags: (a.tags?.tag ?? []).map((t: any) => t.name),
      tracks: (a.tracks?.track ?? []).map((t: any) => ({
        name: t.name,
        rank: t["@attr"]?.rank ? Number(t["@attr"].rank) : null,
        duration: t.duration ? Number(t.duration) : null,
        url: t.url,
      })),
      wiki: a.wiki?.summary?.replace(/<[^>]*>/g, "").trim() ?? null,
    });
  } catch (error) {
    return toolError(error);
  }
}

export async function getTrackInfoHandler(args: {
  artist: string;
  track: string;
  username?: string;
}) {
  try {
    const params: Record<string, string> = {
      artist: args.artist,
      track: args.track,
      autocorrect: "1",
    };
    if (args.username) params.username = args.username;

    const data = await lastfmFetch("track.getInfo", params);
    const t = data.track;
    return toolResult({
      name: t.name,
      artist: t.artist?.name ?? t.artist,
      mbid: t.mbid || null,
      url: t.url,
      listeners: Number(t.listeners ?? 0),
      playcount: Number(t.playcount ?? 0),
      userplaycount: t.userplaycount ? Number(t.userplaycount) : null,
      userloved: t.userloved === "1",
      duration_ms: t.duration ? Number(t.duration) : null,
      tags: (t.toptags?.tag ?? []).map((tag: any) => tag.name),
      album: t.album
        ? { title: t.album.title, artist: t.album.artist, url: t.album.url }
        : null,
      wiki: t.wiki?.summary?.replace(/<[^>]*>/g, "").trim() ?? null,
    });
  } catch (error) {
    return toolError(error);
  }
}

export async function getSimilarArtistsHandler(args: {
  artist: string;
  limit?: number;
}) {
  try {
    const params: Record<string, string> = {
      artist: args.artist,
      autocorrect: "1",
      limit: String(args.limit ?? 20),
    };

    const data = await lastfmFetch("artist.getSimilar", params);
    const artists = (data.similarartists?.artist ?? []).map((a: any) => ({
      name: a.name,
      match: a.match ? Number(Number(a.match).toFixed(3)) : null,
      mbid: a.mbid || null,
      url: a.url,
    }));
    return toolResult({ artists });
  } catch (error) {
    return toolError(error);
  }
}

export async function getSimilarTracksHandler(args: {
  artist: string;
  track: string;
  limit?: number;
}) {
  try {
    const params: Record<string, string> = {
      artist: args.artist,
      track: args.track,
      autocorrect: "1",
      limit: String(args.limit ?? 20),
    };

    const data = await lastfmFetch("track.getSimilar", params);
    const tracks = (data.similartracks?.track ?? []).map((t: any) => ({
      name: t.name,
      artist: t.artist?.name ?? t.artist,
      match: t.match ? Number(Number(t.match).toFixed(3)) : null,
      playcount: t.playcount ? Number(t.playcount) : null,
      duration: t.duration ? Number(t.duration) : null,
      url: t.url,
    }));
    return toolResult({ tracks });
  } catch (error) {
    return toolError(error);
  }
}

export async function getTopTracksHandler(args: {
  artist: string;
  limit?: number;
  page?: number;
}) {
  try {
    const params: Record<string, string> = {
      artist: args.artist,
      autocorrect: "1",
      limit: String(args.limit ?? 20),
    };
    if (args.page) params.page = String(args.page);

    const data = await lastfmFetch("artist.getTopTracks", params);
    const tracks = (data.toptracks?.track ?? []).map((t: any) => ({
      name: t.name,
      playcount: Number(t.playcount ?? 0),
      listeners: Number(t.listeners ?? 0),
      rank: t["@attr"]?.rank ? Number(t["@attr"].rank) : null,
      url: t.url,
    }));
    return toolResult({ tracks });
  } catch (error) {
    return toolError(error);
  }
}

export async function getTagArtistsHandler(args: {
  tag: string;
  limit?: number;
  page?: number;
}) {
  try {
    const params: Record<string, string> = {
      tag: args.tag,
      limit: String(args.limit ?? 20),
    };
    if (args.page) params.page = String(args.page);

    const data = await lastfmFetch("tag.getTopArtists", params);
    const artists = (data.topartists?.artist ?? []).map((a: any) => ({
      name: a.name,
      rank: a["@attr"]?.rank ? Number(a["@attr"].rank) : null,
      mbid: a.mbid || null,
      url: a.url,
    }));
    return toolResult({ artists });
  } catch (error) {
    return toolError(error);
  }
}

export async function getGeoTopTracksHandler(args: {
  country: string;
  limit?: number;
  page?: number;
}) {
  try {
    const params: Record<string, string> = {
      country: args.country,
      limit: String(args.limit ?? 20),
    };
    if (args.page) params.page = String(args.page);

    const data = await lastfmFetch("geo.getTopTracks", params);
    const tracks = (data.tracks?.track ?? []).map((t: any) => ({
      name: t.name,
      artist: t.artist?.name ?? t.artist,
      listeners: Number(t.listeners ?? 0),
      rank: t["@attr"]?.rank ? Number(t["@attr"].rank) : null,
      mbid: t.mbid || null,
      url: t.url,
    }));
    return toolResult({ tracks });
  } catch (error) {
    return toolError(error);
  }
}

// --- Tool definitions ---

const getArtistInfo = tool(
  "get_artist_info",
  "Get Last.fm artist stats: global listener and play counts, community tags, similar artists, and bio. Optionally include a username to see that user's personal play count for the artist.",
  {
    artist: z.string().max(200).describe("Artist name"),
    username: z.string().max(100).optional().describe("Last.fm username (adds personal play count)"),
  },
  getArtistInfoHandler,
);

const getAlbumInfo = tool(
  "get_album_info",
  "Get Last.fm album stats: global listener and play counts, tracklist with durations, community tags, and wiki. Optionally include a username to see personal play count.",
  {
    artist: z.string().max(200).describe("Artist name"),
    album: z.string().max(200).describe("Album name"),
    username: z.string().max(100).optional().describe("Last.fm username (adds personal play count)"),
  },
  getAlbumInfoHandler,
);

const getTrackInfo = tool(
  "get_track_info",
  "Get Last.fm track stats: global listener and play counts, duration, community tags, album info, and wiki. Optionally include a username to see personal play count and loved status.",
  {
    artist: z.string().max(200).describe("Artist name"),
    track: z.string().max(200).describe("Track name"),
    username: z.string().max(100).optional().describe("Last.fm username (adds personal stats)"),
  },
  getTrackInfoHandler,
);

const getSimilarArtists = tool(
  "get_similar_artists",
  "Get artists similar to a given artist from Last.fm, with numeric match scores (0-1) based on listener behavior. Great for discovering related artists and mapping sonic connections.",
  {
    artist: z.string().max(200).describe("Artist name"),
    limit: z.number().optional().describe("Number of results (default 20)"),
  },
  getSimilarArtistsHandler,
);

const getSimilarTracks = tool(
  "get_similar_tracks",
  "Get tracks similar to a given track from Last.fm, with numeric match scores based on listener behavior. Useful for finding songs with a similar vibe or building playlists.",
  {
    artist: z.string().max(200).describe("Artist name"),
    track: z.string().max(200).describe("Track name"),
    limit: z.number().optional().describe("Number of results (default 20)"),
  },
  getSimilarTracksHandler,
);

const getTopTracks = tool(
  "get_top_tracks",
  "Get an artist's most popular tracks on Last.fm ranked by play count. Shows which songs resonate most with listeners based on actual scrobble data.",
  {
    artist: z.string().max(200).describe("Artist name"),
    limit: z.number().optional().describe("Number of results (default 20)"),
    page: z.number().optional().describe("Page number"),
  },
  getTopTracksHandler,
);

const getTagArtists = tool(
  "get_tag_artists",
  "Get the top artists for a genre, mood, or scene tag on Last.fm. Uses community-driven folksonomy — supports micro-genres, moods, eras, and scenes (e.g., 'shoegaze', 'dark ambient', 'protest music').",
  {
    tag: z.string().max(100).describe("Tag/genre name"),
    limit: z.number().optional().describe("Number of results (default 20)"),
    page: z.number().optional().describe("Page number"),
  },
  getTagArtistsHandler,
);

const getGeoTopTracks = tool(
  "get_geo_top_tracks",
  "Get the most popular tracks in a specific country on Last.fm. Shows what's trending in a region based on scrobble data.",
  {
    country: z.string().max(100).describe("Country name (e.g., 'Germany', 'Japan', 'Brazil')"),
    limit: z.number().optional().describe("Number of results (default 20)"),
    page: z.number().optional().describe("Page number"),
  },
  getGeoTopTracksHandler,
);

// --- Server export ---

export const lastfmServer = createSdkMcpServer({
  name: "lastfm",
  version: "1.0.0",
  tools: [
    getArtistInfo,
    getAlbumInfo,
    getTrackInfo,
    getSimilarArtists,
    getSimilarTracks,
    getTopTracks,
    getTagArtists,
    getGeoTopTracks,
  ],
});
