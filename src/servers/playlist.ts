// src/servers/playlist.ts
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { getDb } from "../utils/db.js";

type ToolResult = { content: [{ type: "text"; text: string }] };

function toolResult(data: unknown): ToolResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }] };
}

function ensureSchema(): void {
  const db = getDb("playlists");
  db.exec(`
    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS playlist_tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL,
      artist TEXT NOT NULL,
      title TEXT NOT NULL,
      album TEXT,
      position INTEGER NOT NULL,
      notes TEXT,
      youtube_url TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist ON playlist_tracks(playlist_id);
  `);
}

let schemaReady = false;
function db() {
  if (!schemaReady) {
    ensureSchema();
    schemaReady = true;
  }
  return getDb("playlists");
}

/** Reset schema flag (for test isolation). */
export function _resetSchema(): void {
  schemaReady = false;
}

// --- Handlers ---

export async function playlistCreateHandler(args: {
  name: string;
  description?: string;
}): Promise<ToolResult> {
  try {
    const d = db();
    const info = d
      .prepare("INSERT INTO playlists (name, description) VALUES (?, ?)")
      .run(args.name, args.description ?? null);
    return toolResult({ id: info.lastInsertRowid, name: args.name, status: "created" });
  } catch (error) {
    return toolError(error);
  }
}

export async function playlistAddTrackHandler(args: {
  playlist_id: number;
  artist: string;
  title: string;
  album?: string;
  notes?: string;
  youtube_url?: string;
  position?: number;
}): Promise<ToolResult> {
  try {
    const d = db();
    const result = d.transaction(() => {
      // Verify playlist exists
      const playlist = d.prepare("SELECT id FROM playlists WHERE id = ?").get(args.playlist_id);
      if (!playlist) throw new Error(`Playlist with id ${args.playlist_id} not found`);

      let pos: number;
      if (args.position !== undefined) {
        // Shift existing tracks at or after this position
        d.prepare(
          "UPDATE playlist_tracks SET position = position + 1 WHERE playlist_id = ? AND position >= ?",
        ).run(args.playlist_id, args.position);
        pos = args.position;
      } else {
        // Append to end
        const max = d
          .prepare("SELECT MAX(position) as max_pos FROM playlist_tracks WHERE playlist_id = ?")
          .get(args.playlist_id) as any;
        pos = (max?.max_pos ?? 0) + 1;
      }

      const info = d
        .prepare(
          `INSERT INTO playlist_tracks (playlist_id, artist, title, album, position, notes, youtube_url)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          args.playlist_id,
          args.artist,
          args.title,
          args.album ?? null,
          pos,
          args.notes ?? null,
          args.youtube_url ?? null,
        );
      return { id: info.lastInsertRowid, position: pos };
    })();
    return toolResult({
      track_id: result.id,
      position: result.position,
      artist: args.artist,
      title: args.title,
      status: "added",
    });
  } catch (error) {
    return toolError(error);
  }
}

export async function playlistListHandler(): Promise<ToolResult> {
  try {
    const d = db();
    const playlists = d
      .prepare(
        `SELECT p.*, COUNT(pt.id) as track_count
         FROM playlists p
         LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
         GROUP BY p.id
         ORDER BY p.updated_at DESC`,
      )
      .all();
    return toolResult({ playlists });
  } catch (error) {
    return toolError(error);
  }
}

export async function playlistGetHandler(args: { playlist_id: number }): Promise<ToolResult> {
  try {
    const d = db();
    const playlist = d.prepare("SELECT * FROM playlists WHERE id = ?").get(args.playlist_id) as any;
    if (!playlist) throw new Error(`Playlist with id ${args.playlist_id} not found`);

    const tracks = d
      .prepare(
        "SELECT * FROM playlist_tracks WHERE playlist_id = ? ORDER BY position",
      )
      .all(args.playlist_id);

    return toolResult({
      ...playlist,
      tracks: (tracks as any[]).map((t) => ({
        id: t.id,
        artist: t.artist,
        title: t.title,
        album: t.album,
        position: t.position,
        notes: t.notes,
        youtube_url: t.youtube_url,
      })),
    });
  } catch (error) {
    return toolError(error);
  }
}

export async function playlistRemoveTrackHandler(args: { track_id: number }): Promise<ToolResult> {
  try {
    const d = db();
    const result = d.transaction(() => {
      const track = d
        .prepare("SELECT playlist_id, position FROM playlist_tracks WHERE id = ?")
        .get(args.track_id) as any;
      if (!track) throw new Error(`Track with id ${args.track_id} not found`);

      d.prepare("DELETE FROM playlist_tracks WHERE id = ?").run(args.track_id);

      // Renumber remaining positions
      d.prepare(
        "UPDATE playlist_tracks SET position = position - 1 WHERE playlist_id = ? AND position > ?",
      ).run(track.playlist_id, track.position);

      return track.playlist_id;
    })();
    return toolResult({ track_id: args.track_id, playlist_id: result, status: "removed" });
  } catch (error) {
    return toolError(error);
  }
}

export async function playlistExportHandler(args: {
  playlist_id: number;
  format?: string;
}): Promise<ToolResult> {
  try {
    const d = db();
    const playlist = d.prepare("SELECT * FROM playlists WHERE id = ?").get(args.playlist_id) as any;
    if (!playlist) throw new Error(`Playlist with id ${args.playlist_id} not found`);

    const tracks = d
      .prepare("SELECT * FROM playlist_tracks WHERE playlist_id = ? ORDER BY position")
      .all(args.playlist_id) as any[];

    const fmt = args.format ?? "markdown";

    if (fmt === "json") {
      return toolResult({
        name: playlist.name,
        description: playlist.description,
        tracks: tracks.map((t) => ({
          artist: t.artist,
          title: t.title,
          album: t.album,
          youtube_url: t.youtube_url,
        })),
      });
    }

    if (fmt === "m3u") {
      const lines = ["#EXTM3U", `#PLAYLIST:${playlist.name}`];
      for (const t of tracks) {
        lines.push(`#EXTINF:-1,${t.artist} - ${t.title}`);
        lines.push(t.youtube_url ?? `ytdl://ytsearch:${t.artist} ${t.title}`);
      }
      return toolResult({ format: "m3u", content: lines.join("\n") });
    }

    // markdown
    const lines = [`# ${playlist.name}`];
    if (playlist.description) lines.push("", playlist.description);
    lines.push("");
    for (const t of tracks) {
      const album = t.album ? ` — *${t.album}*` : "";
      lines.push(`${t.position}. **${t.artist}** — ${t.title}${album}`);
    }
    return toolResult({ format: "markdown", content: lines.join("\n") });
  } catch (error) {
    return toolError(error);
  }
}

export async function playlistDeleteHandler(args: { playlist_id: number }): Promise<ToolResult> {
  try {
    const d = db();
    const info = d.prepare("DELETE FROM playlists WHERE id = ?").run(args.playlist_id);
    if (info.changes === 0) {
      throw new Error(`Playlist with id ${args.playlist_id} not found`);
    }
    return toolResult({ playlist_id: args.playlist_id, status: "deleted" });
  } catch (error) {
    return toolError(error);
  }
}

// --- Tool definitions ---

const playlistCreate = tool(
  "playlist_create",
  "Create a new playlist. Returns the playlist ID.",
  {
    name: z.string().describe("Playlist name"),
    description: z.string().optional().describe("Playlist description"),
  },
  playlistCreateHandler,
);

const playlistAddTrack = tool(
  "playlist_add_track",
  "Add a track to a playlist. Auto-positions at end, or insert at a specific position (shifts others).",
  {
    playlist_id: z.number().describe("Playlist ID"),
    artist: z.string().describe("Artist name"),
    title: z.string().describe("Track title"),
    album: z.string().optional().describe("Album name"),
    notes: z.string().optional().describe("Notes about this track"),
    youtube_url: z.string().optional().describe("YouTube URL for playback"),
    position: z.number().optional().describe("Insert at position (shifts existing tracks)"),
  },
  playlistAddTrackHandler,
);

const playlistList = tool(
  "playlist_list",
  "List all playlists with track counts.",
  {},
  playlistListHandler,
);

const playlistGet = tool(
  "playlist_get",
  "Get a playlist with all its tracks ordered by position. Track format matches play_playlist input for easy chaining.",
  { playlist_id: z.number().describe("Playlist ID") },
  playlistGetHandler,
);

const playlistRemoveTrack = tool(
  "playlist_remove_track",
  "Remove a track from a playlist by track ID. Remaining tracks are renumbered.",
  { track_id: z.number().describe("Track ID to remove") },
  playlistRemoveTrackHandler,
);

const playlistExport = tool(
  "playlist_export",
  "Export a playlist in markdown, M3U, or JSON format.",
  {
    playlist_id: z.number().describe("Playlist ID"),
    format: z
      .enum(["markdown", "m3u", "json"])
      .optional()
      .describe("Export format (default: markdown)"),
  },
  playlistExportHandler,
);

const playlistDelete = tool(
  "playlist_delete",
  "Delete a playlist and all its tracks.",
  { playlist_id: z.number().describe("Playlist ID to delete") },
  playlistDeleteHandler,
);

// --- Server export ---

export const playlistServer = createSdkMcpServer({
  name: "playlist",
  version: "1.0.0",
  tools: [
    playlistCreate,
    playlistAddTrack,
    playlistList,
    playlistGet,
    playlistRemoveTrack,
    playlistExport,
    playlistDelete,
  ],
});
