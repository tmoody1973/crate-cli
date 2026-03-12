// src/servers/itunes.ts — iTunes Search API (free, no API key)
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const BASE_URL = "https://itunes.apple.com";
const RATE_LIMIT_MS = 3000; // ~20 req/min = 1 per 3 sec
const FETCH_TIMEOUT_MS = 10_000;

let lastRequest = 0;

type ToolResult = { content: [{ type: "text"; text: string }] };

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(message: string): ToolResult {
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

/** Upgrade artwork URL to higher resolution (default 100x100). */
function hiResArtwork(url: string, size = 600): string {
  return url.replace(/\d+x\d+bb/, `${size}x${size}bb`);
}

async function itunesFetch(
  path: string,
  params: Record<string, string>,
): Promise<any> {
  await rateLimit();

  const url = new URL(path, BASE_URL);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { "User-Agent": "Crate-CLI/1.0 (music-research-agent)" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`iTunes API error: ${res.status}`);
  }

  return res.json();
}

// ── Handlers ──────────────────────────────────────────────────────

async function searchSongsHandler(input: {
  query: string;
  limit?: number;
}): Promise<ToolResult> {
  try {
    const data = await itunesFetch("/search", {
      term: input.query,
      media: "music",
      entity: "song",
      limit: String(input.limit ?? 5),
      country: "US",
    });

    const results = (data.results ?? []).map((r: any) => ({
      trackName: r.trackName,
      artistName: r.artistName,
      albumName: r.collectionName,
      artworkUrl: r.artworkUrl100 ? hiResArtwork(r.artworkUrl100) : null,
      previewUrl: r.previewUrl ?? null,
      genre: r.primaryGenreName,
      releaseDate: r.releaseDate?.split("T")[0] ?? null,
      trackTimeMs: r.trackTimeMillis ?? null,
      trackUrl: r.trackViewUrl ?? null,
      artistId: r.artistId,
      albumId: r.collectionId,
    }));

    return ok({ resultCount: data.resultCount, results });
  } catch (e) {
    return err(e instanceof Error ? e.message : "iTunes search failed");
  }
}

async function searchAlbumsHandler(input: {
  query: string;
  limit?: number;
}): Promise<ToolResult> {
  try {
    const data = await itunesFetch("/search", {
      term: input.query,
      media: "music",
      entity: "album",
      limit: String(input.limit ?? 5),
      country: "US",
    });

    const results = (data.results ?? []).map((r: any) => ({
      albumName: r.collectionName,
      artistName: r.artistName,
      artworkUrl: r.artworkUrl100 ? hiResArtwork(r.artworkUrl100) : null,
      trackCount: r.trackCount,
      genre: r.primaryGenreName,
      releaseDate: r.releaseDate?.split("T")[0] ?? null,
      albumUrl: r.collectionViewUrl ?? null,
      artistId: r.artistId,
      albumId: r.collectionId,
    }));

    return ok({ resultCount: data.resultCount, results });
  } catch (e) {
    return err(e instanceof Error ? e.message : "iTunes album search failed");
  }
}

async function searchArtistsHandler(input: {
  query: string;
  limit?: number;
}): Promise<ToolResult> {
  try {
    const data = await itunesFetch("/search", {
      term: input.query,
      media: "music",
      entity: "musicArtist",
      limit: String(input.limit ?? 5),
      country: "US",
    });

    const results = (data.results ?? []).map((r: any) => ({
      artistName: r.artistName,
      genre: r.primaryGenreName,
      artistUrl: r.artistLinkUrl ?? null,
      artistId: r.artistId,
    }));

    return ok({ resultCount: data.resultCount, results });
  } catch (e) {
    return err(e instanceof Error ? e.message : "iTunes artist search failed");
  }
}

async function lookupAlbumHandler(input: {
  albumId: number;
}): Promise<ToolResult> {
  try {
    const data = await itunesFetch("/lookup", {
      id: String(input.albumId),
      entity: "song",
    });

    const items = data.results ?? [];
    const album = items.find((r: any) => r.wrapperType === "collection");
    const tracks = items
      .filter((r: any) => r.wrapperType === "track")
      .map((r: any) => ({
        trackNumber: r.trackNumber,
        trackName: r.trackName,
        artistName: r.artistName,
        duration: r.trackTimeMillis
          ? `${Math.floor(r.trackTimeMillis / 60000)}:${String(Math.floor((r.trackTimeMillis % 60000) / 1000)).padStart(2, "0")}`
          : null,
        previewUrl: r.previewUrl ?? null,
      }));

    return ok({
      albumName: album?.collectionName,
      artistName: album?.artistName,
      artworkUrl: album?.artworkUrl100 ? hiResArtwork(album.artworkUrl100) : null,
      trackCount: album?.trackCount,
      releaseDate: album?.releaseDate?.split("T")[0] ?? null,
      genre: album?.primaryGenreName,
      tracks,
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : "iTunes album lookup failed");
  }
}

// ── Tools ──────────────────────────────────────────────────────────

const searchSongs = tool(
  "search_itunes_songs",
  "Search iTunes/Apple Music for songs. Returns track name, artist, album, artwork URL (high-res 600x600), preview URL, genre, and release date. Great for finding album artwork.",
  {
    query: z.string().describe("Search query — artist name, track title, or both"),
    limit: z.number().min(1).max(25).optional().describe("Max results (default 5)"),
  },
  searchSongsHandler,
);

const searchAlbums = tool(
  "search_itunes_albums",
  "Search iTunes/Apple Music for albums. Returns album name, artist, artwork URL (high-res 600x600), track count, genre, and release date.",
  {
    query: z.string().describe("Search query — artist or album name"),
    limit: z.number().min(1).max(25).optional().describe("Max results (default 5)"),
  },
  searchAlbumsHandler,
);

const searchArtists = tool(
  "search_itunes_artists",
  "Search iTunes/Apple Music for artists. Returns artist name, genre, and Apple Music URL.",
  {
    query: z.string().describe("Artist name"),
    limit: z.number().min(1).max(25).optional().describe("Max results (default 5)"),
  },
  searchArtistsHandler,
);

const lookupAlbumTracks = tool(
  "lookup_itunes_album",
  "Look up an album by iTunes ID. Returns full track listing with artwork, preview URLs, and durations.",
  {
    albumId: z.number().describe("iTunes collection/album ID"),
  },
  lookupAlbumHandler,
);

// ── Server ─────────────────────────────────────────────────────────

export function createItunesServer() {
  return createSdkMcpServer({
    name: "itunes",
    version: "1.0.0",
    tools: [searchSongs, searchAlbums, searchArtists, lookupAlbumTracks],
  });
}
