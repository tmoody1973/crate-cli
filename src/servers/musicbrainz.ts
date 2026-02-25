import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const BASE_URL = "https://musicbrainz.org/ws/2";
const USER_AGENT = "Crate/0.1.0 (https://github.com/user/crate-cli)";
const RATE_LIMIT_MS = 1100;
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

async function mbFetch(path: string): Promise<any> {
  await rateLimit();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`MusicBrainz API error: ${res.status}`);
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

function toolResult(data: unknown): { content: [{ type: "text"; text: string }] } {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(error: unknown): { content: [{ type: "text"; text: string }] } {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }] };
}

// --- Handler functions (exported for testing) ---

export async function searchArtistHandler(args: { query: string }) {
  try {
    const data = await mbFetch(
      `/artist?query=${encodeURIComponent(args.query)}&fmt=json&limit=10`,
    );
    return toolResult(data.artists);
  } catch (error) {
    return toolError(error);
  }
}

export async function getArtistHandler(args: { mbid: string }) {
  try {
    const data = await mbFetch(
      `/artist/${args.mbid}?fmt=json&inc=artist-rels+url-rels+release-groups`,
    );
    return toolResult(data);
  } catch (error) {
    return toolError(error);
  }
}

export async function searchReleaseHandler(args: { query: string; artist?: string }) {
  try {
    let q = args.query;
    if (args.artist) q += ` AND artist:${args.artist}`;
    const data = await mbFetch(
      `/release?query=${encodeURIComponent(q)}&fmt=json&limit=10`,
    );
    return toolResult(data.releases);
  } catch (error) {
    return toolError(error);
  }
}

export async function getReleaseHandler(args: { mbid: string }) {
  try {
    const data = await mbFetch(
      `/release/${args.mbid}?fmt=json&inc=recordings+artist-credits+labels`,
    );
    return toolResult(data);
  } catch (error) {
    return toolError(error);
  }
}

export async function searchRecordingHandler(args: { query: string; artist?: string }) {
  try {
    let q = args.query;
    if (args.artist) q += ` AND artist:${args.artist}`;
    const data = await mbFetch(
      `/recording?query=${encodeURIComponent(q)}&fmt=json&limit=10`,
    );
    return toolResult(data.recordings);
  } catch (error) {
    return toolError(error);
  }
}

export async function getRecordingCreditsHandler(args: { mbid: string }) {
  try {
    const data = await mbFetch(
      `/recording/${args.mbid}?fmt=json&inc=artist-credits+artist-rels+work-rels`,
    );
    return toolResult(data);
  } catch (error) {
    return toolError(error);
  }
}

// --- Tool definitions ---

const searchArtist = tool(
  "search_artist",
  "Search MusicBrainz for artists by name. Returns a ranked list of matching artists with IDs, disambiguation, type, and country.",
  { query: z.string().max(200).describe("Artist name to search for") },
  searchArtistHandler,
);

const getArtist = tool(
  "get_artist",
  "Get full artist details from MusicBrainz by MBID. Includes relationships (collaborations, member-of, URLs) and release groups (albums, singles, EPs).",
  { mbid: z.string().max(50).describe("MusicBrainz artist ID (UUID format)") },
  getArtistHandler,
);

const searchRelease = tool(
  "search_release",
  "Search MusicBrainz for releases (albums, singles, EPs). Optionally filter by artist name.",
  {
    query: z.string().max(200).describe("Release title to search for"),
    artist: z.string().max(200).optional().describe("Filter by artist name"),
  },
  searchReleaseHandler,
);

const getRelease = tool(
  "get_release",
  "Get full release details from MusicBrainz by MBID. Includes tracklist with recordings, artist credits, and label information.",
  { mbid: z.string().max(50).describe("MusicBrainz release ID (UUID format)") },
  getReleaseHandler,
);

const searchRecording = tool(
  "search_recording",
  "Search MusicBrainz for recordings (individual tracks). Optionally filter by artist name.",
  {
    query: z.string().max(200).describe("Recording/track title to search for"),
    artist: z.string().max(200).optional().describe("Filter by artist name"),
  },
  searchRecordingHandler,
);

const getRecordingCredits = tool(
  "get_recording_credits",
  "Get detailed credits for a recording from MusicBrainz by MBID. Includes artist credits, artist relationships (producer, engineer, etc.), and work relationships.",
  {
    mbid: z.string().max(50).describe("MusicBrainz recording ID (UUID format)"),
  },
  getRecordingCreditsHandler,
);

// --- Tool + Server exports ---

export const musicbrainzTools = [searchArtist, getArtist, searchRelease, getRelease, searchRecording, getRecordingCredits];

export const musicbrainzServer = createSdkMcpServer({
  name: "musicbrainz",
  version: "1.0.0",
  tools: musicbrainzTools,
});
