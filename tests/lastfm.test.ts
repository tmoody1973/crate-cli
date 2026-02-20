import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Set required env vars
process.env.LASTFM_API_KEY = "test-api-key";

describe("lastfm", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("rateLimit", () => {
    it("enforces minimum delay between requests", async () => {
      const { rateLimit } = await import("../src/servers/lastfm.js");
      const start = Date.now();
      await rateLimit();
      await rateLimit();
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(150);
    });
  });

  describe("lastfmFetch", () => {
    it("throws when API key is missing", async () => {
      const orig = process.env.LASTFM_API_KEY;
      delete process.env.LASTFM_API_KEY;
      const { lastfmFetch } = await import("../src/servers/lastfm.js");
      await expect(lastfmFetch("artist.getInfo")).rejects.toThrow("LASTFM_API_KEY is required");
      process.env.LASTFM_API_KEY = orig;
    });

    it("throws on Last.fm error response (HTTP 200 with error field)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: 6, message: "Artist not found" }),
      });
      const { lastfmFetch } = await import("../src/servers/lastfm.js");
      await expect(lastfmFetch("artist.getInfo", { artist: "xyznonexistent" })).rejects.toThrow(
        "Last.fm: Artist not found",
      );
    });
  });

  describe("getArtistInfoHandler", () => {
    it("returns formatted artist info", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          artist: {
            name: "Radiohead",
            mbid: "a74b1b7f-71a5-4011-9441-d0b5e4122711",
            url: "https://www.last.fm/music/Radiohead",
            stats: { listeners: "4500000", playcount: "350000000", userplaycount: "1234" },
            tags: { tag: [{ name: "alternative" }, { name: "rock" }] },
            similar: {
              artist: [
                { name: "Thom Yorke", url: "https://www.last.fm/music/Thom+Yorke" },
              ],
            },
            bio: { summary: "Radiohead are an English rock band. <a href=\"https://last.fm\">Read more</a>" },
          },
        }),
      });

      const { getArtistInfoHandler } = await import("../src/servers/lastfm.js");
      const result = await getArtistInfoHandler({ artist: "Radiohead", username: "testuser" });
      const data = JSON.parse(result.content[0].text);
      expect(data.name).toBe("Radiohead");
      expect(data.listeners).toBe(4500000);
      expect(data.playcount).toBe(350000000);
      expect(data.userplaycount).toBe(1234);
      expect(data.tags).toContain("alternative");
      expect(data.similar[0].name).toBe("Thom Yorke");
      expect(data.bio_summary).not.toContain("<a");
    });
  });

  describe("getAlbumInfoHandler", () => {
    it("returns formatted album info with tracklist", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          album: {
            name: "OK Computer",
            artist: "Radiohead",
            mbid: "b1392450-e666-3926-a536-22c65f834433",
            url: "https://www.last.fm/music/Radiohead/OK+Computer",
            listeners: "2800000",
            playcount: "98000000",
            tags: { tag: [{ name: "alternative rock" }] },
            tracks: {
              track: [
                { name: "Airbag", "@attr": { rank: "1" }, duration: "283", url: "https://last.fm/track1" },
                { name: "Paranoid Android", "@attr": { rank: "2" }, duration: "386", url: "https://last.fm/track2" },
              ],
            },
            wiki: { summary: "OK Computer is the third album. <a href=\"https://last.fm\">Read more</a>" },
          },
        }),
      });

      const { getAlbumInfoHandler } = await import("../src/servers/lastfm.js");
      const result = await getAlbumInfoHandler({ artist: "Radiohead", album: "OK Computer" });
      const data = JSON.parse(result.content[0].text);
      expect(data.name).toBe("OK Computer");
      expect(data.tracks).toHaveLength(2);
      expect(data.tracks[0].name).toBe("Airbag");
      expect(data.tracks[0].rank).toBe(1);
      expect(data.tracks[1].duration).toBe(386);
      expect(data.wiki).not.toContain("<a");
    });
  });

  describe("getTrackInfoHandler", () => {
    it("returns formatted track info", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          track: {
            name: "Paranoid Android",
            artist: { name: "Radiohead" },
            mbid: "some-mbid",
            url: "https://www.last.fm/music/Radiohead/_/Paranoid+Android",
            listeners: "1800000",
            playcount: "42000000",
            userplaycount: "87",
            userloved: "1",
            duration: "386000",
            toptags: { tag: [{ name: "alternative" }, { name: "progressive rock" }] },
            album: { title: "OK Computer", artist: "Radiohead", url: "https://last.fm/album" },
            wiki: { summary: "Paranoid Android is a song. <a href=\"https://last.fm\">Read more</a>" },
          },
        }),
      });

      const { getTrackInfoHandler } = await import("../src/servers/lastfm.js");
      const result = await getTrackInfoHandler({ artist: "Radiohead", track: "Paranoid Android", username: "testuser" });
      const data = JSON.parse(result.content[0].text);
      expect(data.name).toBe("Paranoid Android");
      expect(data.artist).toBe("Radiohead");
      expect(data.userloved).toBe(true);
      expect(data.duration_ms).toBe(386000);
      expect(data.tags).toContain("progressive rock");
      expect(data.album.title).toBe("OK Computer");
      expect(data.wiki).not.toContain("<a");
    });
  });

  describe("getSimilarArtistsHandler", () => {
    it("returns similar artists with match scores", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          similarartists: {
            artist: [
              { name: "Thom Yorke", match: "0.987654", mbid: "mbid1", url: "https://last.fm/thom" },
              { name: "Muse", match: "0.654321", mbid: "mbid2", url: "https://last.fm/muse" },
            ],
          },
        }),
      });

      const { getSimilarArtistsHandler } = await import("../src/servers/lastfm.js");
      const result = await getSimilarArtistsHandler({ artist: "Radiohead", limit: 10 });
      const data = JSON.parse(result.content[0].text);
      expect(data.artists).toHaveLength(2);
      expect(data.artists[0].name).toBe("Thom Yorke");
      expect(data.artists[0].match).toBe(0.988); // rounded to 3 decimals
      expect(data.artists[1].match).toBe(0.654);
    });
  });

  describe("getSimilarTracksHandler", () => {
    it("returns similar tracks with match scores", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          similartracks: {
            track: [
              {
                name: "Subterranean Homesick Alien",
                artist: { name: "Radiohead" },
                match: "0.912",
                playcount: "5000000",
                duration: "265",
                url: "https://last.fm/track1",
              },
            ],
          },
        }),
      });

      const { getSimilarTracksHandler } = await import("../src/servers/lastfm.js");
      const result = await getSimilarTracksHandler({ artist: "Radiohead", track: "Paranoid Android" });
      const data = JSON.parse(result.content[0].text);
      expect(data.tracks).toHaveLength(1);
      expect(data.tracks[0].name).toBe("Subterranean Homesick Alien");
      expect(data.tracks[0].artist).toBe("Radiohead");
      expect(data.tracks[0].match).toBe(0.912);
    });
  });

  describe("getTopTracksHandler", () => {
    it("returns top tracks ranked by playcount", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          toptracks: {
            track: [
              { name: "Creep", playcount: "95000000", listeners: "3200000", "@attr": { rank: "1" }, url: "https://last.fm/creep" },
              { name: "Karma Police", playcount: "62000000", listeners: "2100000", "@attr": { rank: "2" }, url: "https://last.fm/karma" },
            ],
          },
        }),
      });

      const { getTopTracksHandler } = await import("../src/servers/lastfm.js");
      const result = await getTopTracksHandler({ artist: "Radiohead", limit: 5 });
      const data = JSON.parse(result.content[0].text);
      expect(data.tracks).toHaveLength(2);
      expect(data.tracks[0].name).toBe("Creep");
      expect(data.tracks[0].playcount).toBe(95000000);
      expect(data.tracks[0].rank).toBe(1);
    });
  });

  describe("getTagArtistsHandler", () => {
    it("returns top artists for a tag", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          topartists: {
            artist: [
              { name: "My Bloody Valentine", "@attr": { rank: "1" }, mbid: "mbid-mbv", url: "https://last.fm/mbv" },
              { name: "Slowdive", "@attr": { rank: "2" }, mbid: "mbid-slowdive", url: "https://last.fm/slowdive" },
            ],
          },
        }),
      });

      const { getTagArtistsHandler } = await import("../src/servers/lastfm.js");
      const result = await getTagArtistsHandler({ tag: "shoegaze", limit: 10 });
      const data = JSON.parse(result.content[0].text);
      expect(data.artists).toHaveLength(2);
      expect(data.artists[0].name).toBe("My Bloody Valentine");
      expect(data.artists[0].rank).toBe(1);
      expect(data.artists[1].name).toBe("Slowdive");
    });
  });

  describe("getGeoTopTracksHandler", () => {
    it("returns top tracks for a country", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tracks: {
            track: [
              {
                name: "99 Luftballons",
                artist: { name: "Nena" },
                listeners: "450000",
                "@attr": { rank: "1" },
                mbid: "mbid-99",
                url: "https://last.fm/99",
              },
            ],
          },
        }),
      });

      const { getGeoTopTracksHandler } = await import("../src/servers/lastfm.js");
      const result = await getGeoTopTracksHandler({ country: "Germany", limit: 10 });
      const data = JSON.parse(result.content[0].text);
      expect(data.tracks).toHaveLength(1);
      expect(data.tracks[0].name).toBe("99 Luftballons");
      expect(data.tracks[0].artist).toBe("Nena");
      expect(data.tracks[0].rank).toBe(1);
    });

    it("returns error on API failure", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
      const { getGeoTopTracksHandler } = await import("../src/servers/lastfm.js");
      const result = await getGeoTopTracksHandler({ country: "InvalidCountry" });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBeDefined();
    });
  });
});
