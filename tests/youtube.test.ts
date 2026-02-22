// tests/youtube.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockExecFileSync = vi.fn();
const mockSpawn = vi.fn();
const mockCreateConnection = vi.fn();
const mockWriteFileSync = vi.fn();
const mockMkdirSync = vi.fn();
const mockUnlinkSync = vi.fn();
const mockFetch = vi.fn();

vi.mock("node:child_process", () => ({
  execFileSync: (...args: any[]) => mockExecFileSync(...args),
  spawn: (...args: any[]) => mockSpawn(...args),
}));

vi.mock("node:net", () => ({
  createConnection: (...args: any[]) => mockCreateConnection(...args),
}));

vi.mock("node:fs", () => ({
  writeFileSync: (...args: any[]) => mockWriteFileSync(...args),
  mkdirSync: (...args: any[]) => mockMkdirSync(...args),
  unlinkSync: (...args: any[]) => mockUnlinkSync(...args),
}));

vi.stubGlobal("fetch", mockFetch);

// Fake event emitter for spawn processes
function fakeProcess() {
  const handlers: Record<string, Function[]> = {};
  return {
    on: (event: string, handler: Function) => {
      handlers[event] = handlers[event] ?? [];
      handlers[event]!.push(handler);
    },
    kill: vi.fn(),
    _emit: (event: string, ...args: any[]) => {
      for (const h of handlers[event] ?? []) h(...args);
    },
  };
}

// Fake socket for IPC
function fakeSocket() {
  const handlers: Record<string, Function[]> = {};
  return {
    on: (event: string, handler: Function) => {
      handlers[event] = handlers[event] ?? [];
      handlers[event]!.push(handler);
    },
    write: vi.fn(),
    destroy: vi.fn(),
    _emit: (event: string, ...args: any[]) => {
      for (const h of handlers[event] ?? []) h(...args);
    },
  };
}

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function parseResult(result: any): any {
  return JSON.parse(result.content[0].text);
}

// Setup which to return valid paths for yt-dlp and mpv
function stubBinaries() {
  mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
    if (cmd === "which") {
      const binary = args[0];
      if (binary === "yt-dlp") return "/opt/homebrew/bin/yt-dlp\n";
      if (binary === "mpv") return "/opt/homebrew/bin/mpv\n";
    }
    return "";
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("youtube", () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
    mockSpawn.mockReset();
    mockCreateConnection.mockReset();
    mockWriteFileSync.mockReset();
    mockMkdirSync.mockReset();
    mockUnlinkSync.mockReset();
    mockFetch.mockReset();
  });

  // =========================================================================
  // search_tracks
  // =========================================================================

  describe("searchTracksHandler", () => {
    it("uses YouTube Data API when YOUTUBE_API_KEY is set", async () => {
      const originalKey = process.env["YOUTUBE_API_KEY"];
      process.env["YOUTUBE_API_KEY"] = "test-api-key";

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [
              {
                id: { videoId: "abc123" },
                snippet: {
                  title: "Test Song",
                  channelTitle: "Test Channel",
                  publishedAt: "2024-01-15T00:00:00Z",
                },
              },
            ],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [
              {
                id: "abc123",
                contentDetails: { duration: "PT3M45S" },
                statistics: { viewCount: "1000000" },
              },
            ],
          }),
        });

      const { searchTracksHandler } = await import("../src/servers/youtube.js");
      const result = parseResult(await searchTracksHandler({ query: "test song" }));

      expect(result.result_count).toBe(1);
      expect(result.results[0].title).toBe("Test Song");
      expect(result.results[0].url).toBe("https://www.youtube.com/watch?v=abc123");
      expect(result.results[0].channel).toBe("Test Channel");
      expect(result.results[0].duration).toBe("3:45");
      expect(result.results[0].duration_seconds).toBe(225);
      expect(result.results[0].views).toBe("1,000,000");

      if (originalKey) {
        process.env["YOUTUBE_API_KEY"] = originalKey;
      } else {
        delete process.env["YOUTUBE_API_KEY"];
      }
    });

    it("falls back to yt-dlp when no API key", async () => {
      const originalKey = process.env["YOUTUBE_API_KEY"];
      delete process.env["YOUTUBE_API_KEY"];

      stubBinaries();
      // Override execFileSync to also handle yt-dlp calls
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === "which") {
          if (args[0] === "yt-dlp") return "/opt/homebrew/bin/yt-dlp\n";
          if (args[0] === "mpv") return "/opt/homebrew/bin/mpv\n";
        }
        if (cmd === "yt-dlp") {
          return JSON.stringify({
            title: "Fallback Song",
            webpage_url: "https://www.youtube.com/watch?v=xyz789",
            uploader: "Fallback Channel",
            duration: 200,
            view_count: 500000,
          }) + "\n";
        }
        return "";
      });

      const { searchTracksHandler } = await import("../src/servers/youtube.js");
      const result = parseResult(await searchTracksHandler({ query: "fallback test" }));

      expect(result.result_count).toBe(1);
      expect(result.results[0].title).toBe("Fallback Song");
      expect(result.results[0].channel).toBe("Fallback Channel");
      expect(result.results[0].duration).toBe("3:20");

      if (originalKey) {
        process.env["YOUTUBE_API_KEY"] = originalKey;
      }
    });

    it("returns error when yt-dlp is not installed and no API key", async () => {
      const originalKey = process.env["YOUTUBE_API_KEY"];
      delete process.env["YOUTUBE_API_KEY"];

      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === "which" && args[0] === "yt-dlp") {
          throw new Error("not found");
        }
        return "";
      });

      const { searchTracksHandler } = await import("../src/servers/youtube.js");
      const result = parseResult(await searchTracksHandler({ query: "test" }));

      expect(result.error).toMatch(/yt-dlp is not installed/);

      if (originalKey) {
        process.env["YOUTUBE_API_KEY"] = originalKey;
      }
    });

    it("handles YouTube API error gracefully", async () => {
      const originalKey = process.env["YOUTUBE_API_KEY"];
      process.env["YOUTUBE_API_KEY"] = "test-key";

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

      const { searchTracksHandler } = await import("../src/servers/youtube.js");
      const result = parseResult(await searchTracksHandler({ query: "test" }));

      expect(result.error).toMatch(/YouTube API error: 403/);

      if (originalKey) {
        process.env["YOUTUBE_API_KEY"] = originalKey;
      } else {
        delete process.env["YOUTUBE_API_KEY"];
      }
    });

    it("returns empty results when API returns no items", async () => {
      const originalKey = process.env["YOUTUBE_API_KEY"];
      process.env["YOUTUBE_API_KEY"] = "test-key";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] }),
      });

      const { searchTracksHandler } = await import("../src/servers/youtube.js");
      const result = parseResult(await searchTracksHandler({ query: "nonexistent" }));

      expect(result.result_count).toBe(0);
      expect(result.results).toEqual([]);

      if (originalKey) {
        process.env["YOUTUBE_API_KEY"] = originalKey;
      } else {
        delete process.env["YOUTUBE_API_KEY"];
      }
    });
  });

  // =========================================================================
  // play_track
  // =========================================================================

  describe("playTrackHandler", () => {
    it("searches and plays when given a query", async () => {
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === "which") {
          if (args[0] === "yt-dlp") return "/opt/homebrew/bin/yt-dlp\n";
          if (args[0] === "mpv") return "/opt/homebrew/bin/mpv\n";
        }
        if (cmd === "yt-dlp") {
          return JSON.stringify({
            title: "Karma Police",
            webpage_url: "https://www.youtube.com/watch?v=1G4isv_Fylg",
            uploader: "Radiohead",
            duration: 264,
          });
        }
        return "";
      });

      const proc = fakeProcess();
      mockSpawn.mockReturnValue(proc);

      const { playTrackHandler } = await import("../src/servers/youtube.js");
      const result = parseResult(
        await playTrackHandler({ query: "Radiohead Karma Police" }),
      );

      expect(result.status).toBe("playing");
      expect(result.title).toBe("Karma Police");
      expect(result.channel).toBe("Radiohead");
      expect(mockSpawn).toHaveBeenCalled();
    });

    it("plays directly when given a URL", async () => {
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === "which") {
          if (args[0] === "yt-dlp") return "/opt/homebrew/bin/yt-dlp\n";
          if (args[0] === "mpv") return "/opt/homebrew/bin/mpv\n";
        }
        if (cmd === "yt-dlp") {
          return JSON.stringify({
            title: "Direct URL Track",
            uploader: "Some Channel",
            duration: 180,
          });
        }
        return "";
      });

      const proc = fakeProcess();
      mockSpawn.mockReturnValue(proc);

      const { playTrackHandler } = await import("../src/servers/youtube.js");
      const result = parseResult(
        await playTrackHandler({ url: "https://www.youtube.com/watch?v=abc123" }),
      );

      expect(result.status).toBe("playing");
      expect(result.title).toBe("Direct URL Track");
      expect(result.url).toBe("https://www.youtube.com/watch?v=abc123");
    });

    it("returns error when no query or URL provided", async () => {
      const { playTrackHandler } = await import("../src/servers/youtube.js");
      const result = parseResult(await playTrackHandler({}));

      expect(result.error).toMatch(/Provide either a query or a URL/);
    });

    it("returns error when yt-dlp is missing", async () => {
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === "which" && args[0] === "yt-dlp") {
          throw new Error("not found");
        }
        return "";
      });

      const { playTrackHandler } = await import("../src/servers/youtube.js");
      const result = parseResult(
        await playTrackHandler({ query: "test" }),
      );

      expect(result.error).toMatch(/yt-dlp is not installed/);
    });

    it("returns error when mpv is missing", async () => {
      mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
        if (cmd === "which") {
          if (args[0] === "yt-dlp") return "/opt/homebrew/bin/yt-dlp\n";
          if (args[0] === "mpv") throw new Error("not found");
        }
        return "";
      });

      const { playTrackHandler } = await import("../src/servers/youtube.js");
      const result = parseResult(
        await playTrackHandler({ query: "test" }),
      );

      expect(result.error).toMatch(/mpv is not installed/);
    });
  });

  // =========================================================================
  // play_playlist
  // =========================================================================

  describe("playPlaylistHandler", () => {
    it("generates M3U and spawns mpv", async () => {
      stubBinaries();
      const proc = fakeProcess();
      mockSpawn.mockReturnValue(proc);

      const { playPlaylistHandler } = await import("../src/servers/youtube.js");
      const result = parseResult(
        await playPlaylistHandler({
          tracks: [
            { artist: "Radiohead", title: "Karma Police" },
            { artist: "Thom Yorke", title: "Suspirium" },
          ],
        }),
      );

      expect(result.status).toBe("playing");
      expect(result.track_count).toBe(2);
      expect(result.shuffle).toBe(false);
      expect(result.first_track).toBe("Radiohead - Karma Police");

      // Verify M3U was written
      expect(mockMkdirSync).toHaveBeenCalled();
      expect(mockWriteFileSync).toHaveBeenCalled();
      const m3uContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(m3uContent).toContain("#EXTM3U");
      expect(m3uContent).toContain("ytdl://ytsearch1:Radiohead - Karma Police");
      expect(m3uContent).toContain("ytdl://ytsearch1:Thom Yorke - Suspirium");
    });

    it("passes --shuffle flag when shuffle is true", async () => {
      stubBinaries();
      const proc = fakeProcess();
      mockSpawn.mockReturnValue(proc);

      const { playPlaylistHandler } = await import("../src/servers/youtube.js");
      const result = parseResult(
        await playPlaylistHandler({
          tracks: [{ artist: "Artist", title: "Song" }],
          shuffle: true,
        }),
      );

      expect(result.shuffle).toBe(true);
      // Verify --shuffle was passed to mpv
      const spawnArgs = mockSpawn.mock.calls[0][1] as string[];
      expect(spawnArgs).toContain("--shuffle");
    });

    it("returns error with empty tracks array", async () => {
      const { playPlaylistHandler } = await import("../src/servers/youtube.js");
      const result = parseResult(
        await playPlaylistHandler({ tracks: [] }),
      );

      expect(result.error).toMatch(/at least one track/);
    });
  });

  // =========================================================================
  // player_control
  // =========================================================================

  describe("playerControlHandler", () => {
    it("stop — kills mpv and returns stopped status", async () => {
      const { playerControlHandler } = await import("../src/servers/youtube.js");
      const result = parseResult(
        await playerControlHandler({ action: "stop" }),
      );

      expect(result.status).toBe("stopped");
    });

    it("stop — is idempotent when no player", async () => {
      const { playerControlHandler } = await import("../src/servers/youtube.js");
      const result = parseResult(
        await playerControlHandler({ action: "stop" }),
      );

      expect(result.status).toBe("stopped");
      expect(result.was_playing).toBe(false);
    });

    it("now_playing — returns stopped when no player", async () => {
      const { playerControlHandler } = await import("../src/servers/youtube.js");
      const result = parseResult(
        await playerControlHandler({ action: "now_playing" }),
      );

      expect(result.status).toBe("stopped");
      expect(result.message).toMatch(/No track/);
    });

    it("pause — returns error when no player", async () => {
      const { playerControlHandler } = await import("../src/servers/youtube.js");
      const result = parseResult(
        await playerControlHandler({ action: "pause" }),
      );

      expect(result.error).toMatch(/No active player/);
    });

    it("set_volume — returns error when no player", async () => {
      const { playerControlHandler } = await import("../src/servers/youtube.js");
      const result = parseResult(
        await playerControlHandler({ action: "set_volume", volume: 50 }),
      );

      expect(result.error).toMatch(/No active player/);
    });
  });
});
