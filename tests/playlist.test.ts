// tests/playlist.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { _setDbDir, closeAll } from "../src/utils/db.js";
import {
  _resetSchema,
  playlistCreateHandler,
  playlistAddTrackHandler,
  playlistListHandler,
  playlistGetHandler,
  playlistRemoveTrackHandler,
  playlistExportHandler,
  playlistDeleteHandler,
} from "../src/servers/playlist.js";

async function parse(result: Promise<any>) {
  const r = await result;
  return JSON.parse(r.content[0].text);
}

describe("playlist", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "crate-playlist-test-"));
    _setDbDir(testDir);
    _resetSchema();
  });

  afterEach(() => {
    closeAll();
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("playlist_create", () => {
    it("creates a playlist", async () => {
      const result = await parse(playlistCreateHandler({ name: "Late Night Jazz" }));
      expect(result.id).toBeDefined();
      expect(result.name).toBe("Late Night Jazz");
      expect(result.status).toBe("created");
    });

    it("creates a playlist with description", async () => {
      const result = await parse(
        playlistCreateHandler({ name: "Study Beats", description: "Lo-fi for focus" }),
      );
      expect(result.id).toBeDefined();
    });
  });

  describe("playlist_add_track", () => {
    let playlistId: number;

    beforeEach(async () => {
      playlistId = (await parse(playlistCreateHandler({ name: "Test" }))).id;
    });

    it("adds a track at end position", async () => {
      const r1 = await parse(
        playlistAddTrackHandler({ playlist_id: playlistId, artist: "Coltrane", title: "A Love Supreme" }),
      );
      expect(r1.position).toBe(1);

      const r2 = await parse(
        playlistAddTrackHandler({ playlist_id: playlistId, artist: "Miles", title: "Kind of Blue" }),
      );
      expect(r2.position).toBe(2);
    });

    it("inserts at specific position and shifts others", async () => {
      await playlistAddTrackHandler({ playlist_id: playlistId, artist: "A", title: "Track 1" });
      await playlistAddTrackHandler({ playlist_id: playlistId, artist: "B", title: "Track 2" });
      await playlistAddTrackHandler({
        playlist_id: playlistId,
        artist: "C",
        title: "Inserted",
        position: 1,
      });

      const playlist = await parse(playlistGetHandler({ playlist_id: playlistId }));
      expect(playlist.tracks[0].title).toBe("Inserted");
      expect(playlist.tracks[0].position).toBe(1);
      expect(playlist.tracks[1].title).toBe("Track 1");
      expect(playlist.tracks[1].position).toBe(2);
    });

    it("stores youtube_url and album", async () => {
      await playlistAddTrackHandler({
        playlist_id: playlistId,
        artist: "Test",
        title: "Song",
        album: "Album",
        youtube_url: "https://youtube.com/watch?v=abc",
      });
      const playlist = await parse(playlistGetHandler({ playlist_id: playlistId }));
      expect(playlist.tracks[0].album).toBe("Album");
      expect(playlist.tracks[0].youtube_url).toBe("https://youtube.com/watch?v=abc");
    });

    it("errors on nonexistent playlist", async () => {
      const result = await parse(
        playlistAddTrackHandler({ playlist_id: 999, artist: "A", title: "B" }),
      );
      expect(result.error).toMatch(/not found/);
    });
  });

  describe("playlist_list", () => {
    it("lists playlists with track counts", async () => {
      const p1 = (await parse(playlistCreateHandler({ name: "Jazz" }))).id;
      await playlistCreateHandler({ name: "Empty" });
      await playlistAddTrackHandler({ playlist_id: p1, artist: "A", title: "1" });
      await playlistAddTrackHandler({ playlist_id: p1, artist: "B", title: "2" });

      const result = await parse(playlistListHandler());
      expect(result.playlists).toHaveLength(2);
      const jazz = result.playlists.find((p: any) => p.name === "Jazz");
      const empty = result.playlists.find((p: any) => p.name === "Empty");
      expect(jazz.track_count).toBe(2);
      expect(empty.track_count).toBe(0);
    });

    it("returns empty array when no playlists", async () => {
      const result = await parse(playlistListHandler());
      expect(result.playlists).toHaveLength(0);
    });
  });

  describe("playlist_get", () => {
    it("returns playlist with tracks ordered by position", async () => {
      const pid = (await parse(playlistCreateHandler({ name: "Test" }))).id;
      await playlistAddTrackHandler({ playlist_id: pid, artist: "B", title: "Second" });
      await playlistAddTrackHandler({
        playlist_id: pid,
        artist: "A",
        title: "First",
        position: 1,
      });

      const result = await parse(playlistGetHandler({ playlist_id: pid }));
      expect(result.name).toBe("Test");
      expect(result.tracks).toHaveLength(2);
      expect(result.tracks[0].title).toBe("First");
      expect(result.tracks[1].title).toBe("Second");
    });

    it("errors on nonexistent playlist", async () => {
      const result = await parse(playlistGetHandler({ playlist_id: 999 }));
      expect(result.error).toMatch(/not found/);
    });
  });

  describe("playlist_remove_track", () => {
    it("removes a track and renumbers positions", async () => {
      const pid = (await parse(playlistCreateHandler({ name: "Test" }))).id;
      await playlistAddTrackHandler({ playlist_id: pid, artist: "A", title: "1" });
      const t2 = await parse(
        playlistAddTrackHandler({ playlist_id: pid, artist: "B", title: "2" }),
      );
      await playlistAddTrackHandler({ playlist_id: pid, artist: "C", title: "3" });

      await parse(playlistRemoveTrackHandler({ track_id: t2.track_id }));

      const playlist = await parse(playlistGetHandler({ playlist_id: pid }));
      expect(playlist.tracks).toHaveLength(2);
      expect(playlist.tracks[0].title).toBe("1");
      expect(playlist.tracks[0].position).toBe(1);
      expect(playlist.tracks[1].title).toBe("3");
      expect(playlist.tracks[1].position).toBe(2);
    });

    it("errors on nonexistent track", async () => {
      const result = await parse(playlistRemoveTrackHandler({ track_id: 999 }));
      expect(result.error).toMatch(/not found/);
    });
  });

  describe("playlist_export", () => {
    let pid: number;

    beforeEach(async () => {
      pid = (await parse(playlistCreateHandler({ name: "Jazz Night", description: "Chill vibes" }))).id;
      await playlistAddTrackHandler({ playlist_id: pid, artist: "Coltrane", title: "A Love Supreme", album: "A Love Supreme" });
      await playlistAddTrackHandler({ playlist_id: pid, artist: "Miles", title: "So What" });
    });

    it("exports as markdown (default)", async () => {
      const result = await parse(playlistExportHandler({ playlist_id: pid }));
      expect(result.format).toBe("markdown");
      expect(result.content).toContain("# Jazz Night");
      expect(result.content).toContain("Coltrane");
      expect(result.content).toContain("So What");
    });

    it("exports as m3u", async () => {
      const result = await parse(playlistExportHandler({ playlist_id: pid, format: "m3u" }));
      expect(result.format).toBe("m3u");
      expect(result.content).toContain("#EXTM3U");
      expect(result.content).toContain("#PLAYLIST:Jazz Night");
      expect(result.content).toContain("Coltrane - A Love Supreme");
    });

    it("exports as json", async () => {
      const result = await parse(playlistExportHandler({ playlist_id: pid, format: "json" }));
      expect(result.name).toBe("Jazz Night");
      expect(result.tracks).toHaveLength(2);
      expect(result.tracks[0].artist).toBe("Coltrane");
    });

    it("errors on nonexistent playlist", async () => {
      const result = await parse(playlistExportHandler({ playlist_id: 999 }));
      expect(result.error).toMatch(/not found/);
    });
  });

  describe("playlist_delete", () => {
    it("deletes a playlist and cascades tracks", async () => {
      const pid = (await parse(playlistCreateHandler({ name: "Test" }))).id;
      await playlistAddTrackHandler({ playlist_id: pid, artist: "A", title: "1" });

      const result = await parse(playlistDeleteHandler({ playlist_id: pid }));
      expect(result.status).toBe("deleted");

      const list = await parse(playlistListHandler());
      expect(list.playlists).toHaveLength(0);
    });

    it("errors on nonexistent playlist", async () => {
      const result = await parse(playlistDeleteHandler({ playlist_id: 999 }));
      expect(result.error).toMatch(/not found/);
    });
  });
});
