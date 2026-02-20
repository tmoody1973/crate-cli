// src/servers/genius.ts
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const BASE_URL = "https://api.genius.com";
const RATE_LIMIT_MS = 200;

let lastRequest = 0;

export async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequest;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
  lastRequest = Date.now();
}

export async function geniusFetch(
  path: string,
  params?: Record<string, string>,
): Promise<any> {
  await rateLimit();

  const token = process.env.GENIUS_ACCESS_TOKEN;
  if (!token) {
    throw new Error("GENIUS_ACCESS_TOKEN is required");
  }

  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("text_format", "plain");
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Genius API error: ${res.status}`);
  }
  const json = await res.json();
  return json.response;
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

export async function searchSongsHandler(args: {
  query: string;
  per_page?: number;
}) {
  try {
    const data = await geniusFetch("/search", {
      q: args.query,
      per_page: String(args.per_page ?? 10),
    });
    const hits = (data.hits ?? []).map((h: any) => {
      const s = h.result;
      return {
        id: s.id,
        title: s.title,
        full_title: s.full_title,
        artist: s.primary_artist?.name,
        artist_id: s.primary_artist?.id,
        url: s.url,
        release_date: s.release_date_for_display,
        thumbnail: s.song_art_image_thumbnail_url,
      };
    });
    return toolResult({ hits });
  } catch (error) {
    return toolError(error);
  }
}

export async function getSongHandler(args: { song_id: number }) {
  try {
    const data = await geniusFetch(`/songs/${args.song_id}`);
    const s = data.song;
    return toolResult({
      id: s.id,
      title: s.title,
      full_title: s.full_title,
      url: s.url,
      release_date: s.release_date_for_display,
      album: s.album ? { id: s.album.id, name: s.album.name, url: s.album.url } : null,
      primary_artist: { id: s.primary_artist?.id, name: s.primary_artist?.name },
      featured_artists: s.featured_artists?.map((a: any) => ({ id: a.id, name: a.name })),
      producer_artists: s.producer_artists?.map((a: any) => ({ id: a.id, name: a.name })),
      writer_artists: s.writer_artists?.map((a: any) => ({ id: a.id, name: a.name })),
      media: s.media?.map((m: any) => ({ provider: m.provider, url: m.url })),
      song_relationships: s.song_relationships
        ?.filter((r: any) => r.songs?.length > 0)
        .map((r: any) => ({
          type: r.relationship_type,
          songs: r.songs.map((rs: any) => ({ id: rs.id, title: rs.full_title })),
        })),
      description: s.description?.plain,
      recording_location: s.recording_location,
      apple_music_id: s.apple_music_id,
    });
  } catch (error) {
    return toolError(error);
  }
}

export async function getSongAnnotationsHandler(args: {
  song_id: number;
  per_page?: number;
}) {
  try {
    const data = await geniusFetch("/referents", {
      song_id: String(args.song_id),
      per_page: String(args.per_page ?? 20),
    });
    const referents = (data.referents ?? []).map((r: any) => ({
      id: r.id,
      fragment: r.fragment,
      annotations: r.annotations?.map((a: any) => ({
        id: a.id,
        body: a.body?.plain?.slice(0, 1000),
        votes_total: a.votes_total,
        verified: a.verified,
        authors: a.authors?.map((au: any) => ({
          id: au.user?.id,
          name: au.user?.name,
        })),
      })),
    }));
    return toolResult({ referents });
  } catch (error) {
    return toolError(error);
  }
}

export async function getArtistGeniusHandler(args: { artist_id: number }) {
  try {
    const data = await geniusFetch(`/artists/${args.artist_id}`);
    const a = data.artist;
    return toolResult({
      id: a.id,
      name: a.name,
      url: a.url,
      image_url: a.image_url,
      description: a.description?.plain?.slice(0, 2000),
      facebook_name: a.facebook_name,
      twitter_name: a.twitter_name,
      instagram_name: a.instagram_name,
      alternate_names: a.alternate_names,
    });
  } catch (error) {
    return toolError(error);
  }
}

export async function getArtistSongsGeniusHandler(args: {
  artist_id: number;
  sort?: string;
  per_page?: number;
  page?: number;
}) {
  try {
    const params: Record<string, string> = {
      sort: args.sort ?? "popularity",
      per_page: String(args.per_page ?? 20),
    };
    if (args.page) params.page = String(args.page);

    const data = await geniusFetch(`/artists/${args.artist_id}/songs`, params);
    const songs = (data.songs ?? []).map((s: any) => ({
      id: s.id,
      title: s.title,
      full_title: s.full_title,
      url: s.url,
      release_date: s.release_date_for_display,
      primary_artist: { id: s.primary_artist?.id, name: s.primary_artist?.name },
    }));
    return toolResult({ songs, next_page: data.next_page });
  } catch (error) {
    return toolError(error);
  }
}

export async function getAnnotationHandler(args: { annotation_id: number }) {
  try {
    const data = await geniusFetch(`/annotations/${args.annotation_id}`);
    const a = data.annotation;
    return toolResult({
      id: a.id,
      body: a.body?.plain?.slice(0, 3000),
      verified: a.verified,
      votes_total: a.votes_total,
      authors: a.authors?.map((au: any) => ({
        id: au.user?.id,
        name: au.user?.name,
      })),
      referent: a.referent
        ? { fragment: a.referent.fragment, song_id: a.referent.song_id }
        : null,
    });
  } catch (error) {
    return toolError(error);
  }
}

// --- Tool definitions ---

const searchSongs = tool(
  "search_songs",
  "Search Genius for songs by title, artist, or lyrics snippet. Returns song matches with IDs, titles, artists, and URLs.",
  {
    query: z.string().describe("Search query (song title, artist name, or lyrics)"),
    per_page: z.number().optional().describe("Results per page (default 10)"),
  },
  searchSongsHandler,
);

const getSong = tool(
  "get_song",
  "Get full song details from Genius by ID. Includes producers, writers, featured artists, song relationships (samples, remixes, covers), media links, and description. Note: lyrics are not available via API — use the returned URL to view them.",
  { song_id: z.number().describe("Genius song ID") },
  getSongHandler,
);

const getSongAnnotations = tool(
  "get_song_annotations",
  "Get crowd-sourced annotations (explanations) for a song's lyrics from Genius. Each annotation explains a specific lyric fragment with community or verified interpretations.",
  {
    song_id: z.number().describe("Genius song ID"),
    per_page: z.number().optional().describe("Annotations per page (default 20)"),
  },
  getSongAnnotationsHandler,
);

const getArtistGenius = tool(
  "get_artist_genius",
  "Get artist profile from Genius by ID. Includes bio/description, social media handles, alternate names, and image.",
  { artist_id: z.number().describe("Genius artist ID") },
  getArtistGeniusHandler,
);

const getArtistSongsGenius = tool(
  "get_artist_songs_genius",
  "Get an artist's songs from Genius, sorted by popularity or title. Returns song titles, IDs, and URLs.",
  {
    artist_id: z.number().describe("Genius artist ID"),
    sort: z.enum(["popularity", "title"]).optional().describe("Sort order (default: popularity)"),
    per_page: z.number().optional().describe("Results per page (default 20)"),
    page: z.number().optional().describe("Page number"),
  },
  getArtistSongsGeniusHandler,
);

const getAnnotation = tool(
  "get_annotation",
  "Get a specific Genius annotation by ID. Returns the full annotation body, verification status, vote count, and authors.",
  { annotation_id: z.number().describe("Genius annotation ID") },
  getAnnotationHandler,
);

// --- Server export ---

export const geniusServer = createSdkMcpServer({
  name: "genius",
  version: "1.0.0",
  tools: [
    searchSongs,
    getSong,
    getSongAnnotations,
    getArtistGenius,
    getArtistSongsGenius,
    getAnnotation,
  ],
});
