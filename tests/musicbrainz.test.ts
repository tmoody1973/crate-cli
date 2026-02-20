import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("musicbrainz", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("rateLimit", () => {
    it("enforces minimum delay between requests", async () => {
      const { rateLimit } = await import("../src/servers/musicbrainz.js");
      const start = Date.now();
      await rateLimit();
      await rateLimit();
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(1000);
    });
  });

  describe("searchArtistHandler", () => {
    it("searches MusicBrainz and returns formatted results", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          artists: [
            { id: "mbid-123", name: "Madlib", disambiguation: "US producer", type: "Person", country: "US", score: 100 },
          ],
        }),
      });

      const { searchArtistHandler } = await import("../src/servers/musicbrainz.js");
      const result = await searchArtistHandler({ query: "Madlib" });
      expect(result.content[0].type).toBe("text");
      const data = JSON.parse(result.content[0].text);
      expect(data[0].name).toBe("Madlib");
      expect(data[0].id).toBe("mbid-123");
    });

    it("returns error on API failure", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
      const { searchArtistHandler } = await import("../src/servers/musicbrainz.js");
      const result = await searchArtistHandler({ query: "test" });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBeDefined();
    });
  });

  describe("getArtistHandler", () => {
    it("fetches artist with relationships and release groups", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "mbid-123", name: "Madlib", type: "Person",
          relations: [{ type: "member of band", target: { name: "Madvillain" } }],
          "release-groups": [{ title: "Madvillainy", "primary-type": "Album" }],
        }),
      });
      const { getArtistHandler } = await import("../src/servers/musicbrainz.js");
      const result = await getArtistHandler({ mbid: "mbid-123" });
      const data = JSON.parse(result.content[0].text);
      expect(data.name).toBe("Madlib");
      expect(data.relations).toBeDefined();
    });
  });

  describe("searchReleaseHandler", () => {
    it("searches releases with optional artist filter", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ releases: [{ id: "rel-1", title: "Madvillainy", status: "Official" }] }),
      });
      const { searchReleaseHandler } = await import("../src/servers/musicbrainz.js");
      const result = await searchReleaseHandler({ query: "Madvillainy", artist: "Madvillain" });
      const data = JSON.parse(result.content[0].text);
      expect(data[0].title).toBe("Madvillainy");
    });
  });

  describe("getReleaseHandler", () => {
    it("fetches release with tracklist and credits", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "rel-1", title: "Madvillainy",
          media: [{ tracks: [{ title: "Accordion", position: 1 }] }],
        }),
      });
      const { getReleaseHandler } = await import("../src/servers/musicbrainz.js");
      const result = await getReleaseHandler({ mbid: "rel-1" });
      const data = JSON.parse(result.content[0].text);
      expect(data.title).toBe("Madvillainy");
      expect(data.media[0].tracks[0].title).toBe("Accordion");
    });
  });

  describe("searchRecordingHandler", () => {
    it("searches recordings with optional artist filter", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recordings: [{ id: "rec-1", title: "Accordion", score: 100 }] }),
      });
      const { searchRecordingHandler } = await import("../src/servers/musicbrainz.js");
      const result = await searchRecordingHandler({ query: "Accordion", artist: "Madvillain" });
      const data = JSON.parse(result.content[0].text);
      expect(data[0].title).toBe("Accordion");
    });
  });

  describe("getRecordingCreditsHandler", () => {
    it("fetches recording with artist credits and relationships", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "rec-1", title: "Accordion",
          "artist-credit": [{ artist: { name: "Madvillain" } }],
          relations: [{ type: "producer", artist: { name: "Madlib" } }],
        }),
      });
      const { getRecordingCreditsHandler } = await import("../src/servers/musicbrainz.js");
      const result = await getRecordingCreditsHandler({ mbid: "rec-1" });
      const data = JSON.parse(result.content[0].text);
      expect(data.title).toBe("Accordion");
      expect(data.relations[0].type).toBe("producer");
    });
  });
});
