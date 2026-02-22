// src/servers/youtube.ts
/**
 * YouTube MCP server — audio playback via yt-dlp + mpv.
 *
 * 4 tools:
 *   1. search_tracks — YouTube search (Data API v3 or yt-dlp fallback)
 *   2. play_track — Search + play via mpv subprocess
 *   3. play_playlist — M3U generation → mpv + yt-dlp
 *   4. player_control — IPC to mpv (pause, resume, next, stop, etc.)
 */

import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  spawnMpv,
  killMpv,
  sendIpcCommand,
  getProperty,
  setProperty,
  registerCleanup,
  requireBinary,
  formatDuration,
  toolResult,
  toolError,
  player,
  SOCKET_WAIT_MS,
  type ToolResult,
} from "../utils/player.js";

// Re-export player accessors so existing imports still work
export {
  isPlayerActive,
  getCurrentTrack,
  isPlaylistMode,
  getPlayerProperty,
  setOnPlayerStopped,
} from "../utils/player.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse ISO 8601 duration (PT#H#M#S) to seconds */
function parseIsoDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] ?? "0", 10);
  const minutes = parseInt(match[2] ?? "0", 10);
  const seconds = parseInt(match[3] ?? "0", 10);
  return hours * 3600 + minutes * 60 + seconds;
}

// ---------------------------------------------------------------------------
// search_tracks handler
// ---------------------------------------------------------------------------

interface TrackResult {
  title: string;
  url: string;
  channel: string;
  duration?: string;
  duration_seconds?: number;
  views?: string;
  published?: string;
}

export async function searchTracksHandler(args: {
  query: string;
  max_results?: number;
}): Promise<ToolResult> {
  const maxResults = Math.min(args.max_results ?? 5, 20);

  try {
    const apiKey = process.env["YOUTUBE_API_KEY"];

    // Path 1: YouTube Data API v3
    if (apiKey) {
      const searchParams = new URLSearchParams({
        part: "snippet",
        q: args.query,
        type: "video",
        videoCategoryId: "10", // Music
        maxResults: String(maxResults),
        key: apiKey,
      });

      const searchResp = await fetch(`${YOUTUBE_API_BASE}/search?${searchParams}`);
      if (!searchResp.ok) {
        throw new Error(`YouTube API error: ${searchResp.status}`);
      }
      const searchData = await searchResp.json() as any;
      const videoIds = (searchData.items ?? [])
        .map((item: any) => item.id?.videoId)
        .filter(Boolean);

      if (videoIds.length === 0) {
        return toolResult({ query: args.query, result_count: 0, results: [] });
      }

      // Get durations from videos endpoint
      const videoParams = new URLSearchParams({
        part: "contentDetails,statistics",
        id: videoIds.join(","),
        key: apiKey,
      });
      const videoResp = await fetch(`${YOUTUBE_API_BASE}/videos?${videoParams}`);
      const videoData = videoResp.ok ? await videoResp.json() as any : { items: [] };
      const videoMap = new Map<string, any>();
      for (const v of videoData.items ?? []) {
        videoMap.set(v.id, v);
      }

      const results: TrackResult[] = (searchData.items ?? []).map((item: any) => {
        const videoId = item.id?.videoId;
        const video = videoMap.get(videoId);
        const durationSec = video?.contentDetails?.duration
          ? parseIsoDuration(video.contentDetails.duration)
          : undefined;

        return {
          title: item.snippet?.title ?? "Unknown",
          url: `https://www.youtube.com/watch?v=${videoId}`,
          channel: item.snippet?.channelTitle ?? "Unknown",
          ...(durationSec != null && {
            duration: formatDuration(durationSec),
            duration_seconds: durationSec,
          }),
          ...(video?.statistics?.viewCount && {
            views: Number(video.statistics.viewCount).toLocaleString(),
          }),
          ...(item.snippet?.publishedAt && {
            published: item.snippet.publishedAt.split("T")[0],
          }),
        };
      });

      return toolResult({ query: args.query, result_count: results.length, results });
    }

    // Path 2: yt-dlp fallback
    requireBinary("yt-dlp");

    const raw = execFileSync("yt-dlp", [
      `ytsearch${maxResults}:${args.query}`,
      "--dump-json",
      "--flat-playlist",
      "--no-warnings",
    ], { encoding: "utf-8", timeout: 30000 });

    const results: TrackResult[] = raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const data = JSON.parse(line);
        const durationSec = data.duration ? Math.round(data.duration) : undefined;
        return {
          title: data.title ?? "Unknown",
          url: data.url ?? data.webpage_url ?? `https://www.youtube.com/watch?v=${data.id}`,
          channel: data.uploader ?? data.channel ?? "Unknown",
          ...(durationSec != null && {
            duration: formatDuration(durationSec),
            duration_seconds: durationSec,
          }),
          ...(data.view_count != null && {
            views: Number(data.view_count).toLocaleString(),
          }),
        };
      });

    return toolResult({ query: args.query, result_count: results.length, results });
  } catch (error) {
    return toolError(error);
  }
}

// ---------------------------------------------------------------------------
// play_track handler
// ---------------------------------------------------------------------------

export async function playTrackHandler(args: {
  query?: string;
  url?: string;
}): Promise<ToolResult> {
  try {
    if (!args.query && !args.url) {
      throw new Error("Provide either a query or a URL to play.");
    }

    requireBinary("yt-dlp");
    requireBinary("mpv");
    registerCleanup();

    let videoUrl: string;
    let title = "Unknown";
    let channel: string | undefined;
    let durationFormatted: string | undefined;

    if (args.url) {
      videoUrl = args.url;

      // Resolve metadata
      try {
        const raw = execFileSync("yt-dlp", [
          args.url,
          "--dump-json",
          "--no-download",
          "--no-warnings",
        ], { encoding: "utf-8", timeout: 15000 });
        const data = JSON.parse(raw);
        title = data.title ?? title;
        channel = data.uploader ?? data.channel;
        if (data.duration) {
          durationFormatted = formatDuration(Math.round(data.duration));
        }
      } catch {
        // metadata optional — still play
      }
    } else {
      // Search for top result
      const raw = execFileSync("yt-dlp", [
        `ytsearch1:${args.query}`,
        "--dump-json",
        "--no-download",
        "--no-warnings",
      ], { encoding: "utf-8", timeout: 15000 });
      const data = JSON.parse(raw);
      videoUrl = data.webpage_url ?? `https://www.youtube.com/watch?v=${data.id}`;
      title = data.title ?? title;
      channel = data.uploader ?? data.channel;
      if (data.duration) {
        durationFormatted = formatDuration(Math.round(data.duration));
      }
    }

    spawnMpv(videoUrl, ["--ytdl=yes"]);

    player.currentTrack = {
      title,
      url: videoUrl,
      ...(channel && { channel }),
      ...(durationFormatted && { duration: durationFormatted }),
    };
    player.isPlaylist = false;
    player.isRadio = false;
    player.stationName = undefined;

    // Wait for socket to be created
    await new Promise((resolve) => setTimeout(resolve, SOCKET_WAIT_MS));

    return toolResult({
      status: "playing",
      title,
      url: videoUrl,
      ...(channel && { channel }),
      ...(durationFormatted && { duration: durationFormatted }),
    });
  } catch (error) {
    return toolError(error);
  }
}

// ---------------------------------------------------------------------------
// play_playlist handler
// ---------------------------------------------------------------------------

export async function playPlaylistHandler(args: {
  tracks: Array<{ artist: string; title: string }>;
  shuffle?: boolean;
}): Promise<ToolResult> {
  try {
    if (!args.tracks || args.tracks.length === 0) {
      throw new Error("Provide at least one track to play.");
    }

    requireBinary("yt-dlp");
    requireBinary("mpv");
    registerCleanup();

    // Generate M3U playlist
    const lines = ["#EXTM3U"];
    for (const track of args.tracks) {
      lines.push(`#EXTINF:-1,${track.artist} - ${track.title}`);
      lines.push(`ytdl://ytsearch1:${track.artist} - ${track.title}`);
    }

    const playlistDir = join(tmpdir(), "crate");
    mkdirSync(playlistDir, { recursive: true });
    const playlistPath = join(playlistDir, `playlist-${Date.now()}.m3u`);
    writeFileSync(playlistPath, lines.join("\n"), "utf-8");

    const extraArgs = ["--ytdl=yes", ...(args.shuffle ? ["--shuffle"] : [])];
    spawnMpv(playlistPath, ["--playlist-start=0", ...extraArgs]);

    player.isPlaylist = true;
    player.playlistPath = playlistPath;
    player.currentTrack = {
      title: `${args.tracks[0]!.artist} - ${args.tracks[0]!.title}`,
      url: playlistPath,
    };
    player.isRadio = false;
    player.stationName = undefined;

    // Wait for socket
    await new Promise((resolve) => setTimeout(resolve, SOCKET_WAIT_MS));

    return toolResult({
      status: "playing",
      track_count: args.tracks.length,
      shuffle: args.shuffle ?? false,
      first_track: `${args.tracks[0]!.artist} - ${args.tracks[0]!.title}`,
    });
  } catch (error) {
    return toolError(error);
  }
}

// ---------------------------------------------------------------------------
// player_control handler
// ---------------------------------------------------------------------------

type PlayerAction =
  | "pause"
  | "resume"
  | "toggle_pause"
  | "next"
  | "previous"
  | "stop"
  | "now_playing"
  | "volume_up"
  | "volume_down"
  | "set_volume";

export async function playerControlHandler(args: {
  action: PlayerAction;
  volume?: number;
}): Promise<ToolResult> {
  try {
    switch (args.action) {
      case "stop": {
        const wasPlaying = !!player.process;
        killMpv();
        return toolResult({
          status: "stopped",
          was_playing: wasPlaying,
        });
      }

      case "now_playing": {
        if (!player.process) {
          return toolResult({ status: "stopped", message: "No track is currently playing." });
        }

        let position: number | undefined;
        let duration: number | undefined;
        let paused: boolean | undefined;
        let volume: number | undefined;
        let mediaTitle: string | undefined;

        try {
          position = await getProperty("time-pos");
          duration = await getProperty("duration");
          paused = await getProperty("pause");
          volume = await getProperty("volume");
          mediaTitle = await getProperty("media-title");
        } catch {
          // IPC may fail if mpv is still loading
        }

        return toolResult({
          status: paused ? "paused" : "playing",
          ...(player.currentTrack && { track: player.currentTrack }),
          ...(mediaTitle && { media_title: mediaTitle }),
          ...(position != null && { position: formatDuration(Math.round(position)) }),
          ...(duration != null && { duration: formatDuration(Math.round(duration)) }),
          ...(volume != null && { volume: Math.round(volume) }),
          is_playlist: player.isPlaylist,
          is_radio: player.isRadio,
          ...(player.stationName && { station_name: player.stationName }),
        });
      }

      case "pause": {
        await setProperty("pause", true);
        return toolResult({ status: "paused" });
      }

      case "resume": {
        await setProperty("pause", false);
        return toolResult({ status: "playing" });
      }

      case "toggle_pause": {
        const paused = await getProperty("pause");
        await setProperty("pause", !paused);
        return toolResult({ status: paused ? "playing" : "paused" });
      }

      case "next": {
        await sendIpcCommand(["playlist-next"]);
        return toolResult({ status: "next_track" });
      }

      case "previous": {
        await sendIpcCommand(["playlist-prev"]);
        return toolResult({ status: "previous_track" });
      }

      case "volume_up": {
        const current = (await getProperty("volume")) ?? 100;
        const newVol = Math.min(Number(current) + 10, 150);
        await setProperty("volume", newVol);
        return toolResult({ status: "volume_set", volume: Math.round(newVol) });
      }

      case "volume_down": {
        const current = (await getProperty("volume")) ?? 100;
        const newVol = Math.max(Number(current) - 10, 0);
        await setProperty("volume", newVol);
        return toolResult({ status: "volume_set", volume: Math.round(newVol) });
      }

      case "set_volume": {
        const vol = args.volume ?? 100;
        if (vol < 0 || vol > 150) {
          throw new Error("Volume must be between 0 and 150.");
        }
        await setProperty("volume", vol);
        return toolResult({ status: "volume_set", volume: vol });
      }

      default:
        throw new Error(`Unknown action: ${args.action}`);
    }
  } catch (error) {
    return toolError(error);
  }
}

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------

const searchTracks = tool(
  "search_tracks",
  "Search YouTube for music tracks. Returns titles, URLs, channels, and durations. " +
    "Uses YouTube Data API v3 when YOUTUBE_API_KEY is set, otherwise falls back to yt-dlp.",
  {
    query: z.string().describe("Search terms (e.g. 'Kendrick Lamar HUMBLE', 'lo-fi hip hop')"),
    max_results: z
      .number()
      .min(1)
      .max(20)
      .optional()
      .describe("Number of results to return (default: 5, max: 20)"),
  },
  searchTracksHandler,
);

const playTrack = tool(
  "play_track",
  "Play a single track from YouTube via mpv. " +
    "Provide a search query OR a YouTube URL. " +
    "Audio plays in the background — use player_control to pause/stop.",
  {
    query: z.string().optional().describe("Search query to find and play (e.g. 'Radiohead Karma Police')"),
    url: z.string().optional().describe("Direct YouTube URL to play"),
  },
  playTrackHandler,
);

const playPlaylist = tool(
  "play_playlist",
  "Play a list of tracks as a playlist via mpv. " +
    "Each track is resolved by yt-dlp on the fly. Supports shuffle.",
  {
    tracks: z
      .array(
        z.object({
          artist: z.string().describe("Artist name"),
          title: z.string().describe("Track title"),
        }),
      )
      .min(1)
      .describe("List of tracks to play"),
    shuffle: z.boolean().optional().describe("Shuffle the playlist (default: false)"),
  },
  playPlaylistHandler,
);

const playerControl = tool(
  "player_control",
  "Control the active mpv audio player. " +
    "Actions: pause, resume, toggle_pause, next, previous, stop, now_playing, volume_up, volume_down, set_volume.",
  {
    action: z
      .enum([
        "pause",
        "resume",
        "toggle_pause",
        "next",
        "previous",
        "stop",
        "now_playing",
        "volume_up",
        "volume_down",
        "set_volume",
      ])
      .describe("Player action to perform"),
    volume: z
      .number()
      .min(0)
      .max(150)
      .optional()
      .describe("Volume level (0-150) for set_volume action"),
  },
  playerControlHandler,
);

// ---------------------------------------------------------------------------
// Server Export
// ---------------------------------------------------------------------------

export const youtubeServer = createSdkMcpServer({
  name: "youtube",
  version: "1.0.0",
  tools: [searchTracks, playTrack, playPlaylist, playerControl],
});
