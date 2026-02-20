import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Set required env vars
process.env.DISCOGS_KEY = "test-key";
process.env.DISCOGS_SECRET = "test-secret";

describe("discogs", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("rateLimit", () => {
    it("enforces minimum delay between requests", async () => {
      const { rateLimit } = await import("../src/servers/discogs.js");
      const start = Date.now();
      await rateLimit();
      await rateLimit();
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(900);
    });
  });

  describe("discogsFetch", () => {
    it("throws when credentials are missing", async () => {
      const origKey = process.env.DISCOGS_KEY;
      delete process.env.DISCOGS_KEY;
      const { discogsFetch } = await import("../src/servers/discogs.js");
      await expect(discogsFetch("/test")).rejects.toThrow("DISCOGS_KEY and DISCOGS_SECRET are required");
      process.env.DISCOGS_KEY = origKey;
    });
  });

  describe("searchDiscogsHandler", () => {
    it("searches and returns formatted results", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            { id: 1, type: "artist", title: "Madlib", year: "2004", country: "US", label: ["Stones Throw"], format: ["Vinyl"], thumb: "http://img.jpg" },
          ],
          pagination: { page: 1, pages: 1 },
        }),
      });

      const { searchDiscogsHandler } = await import("../src/servers/discogs.js");
      const result = await searchDiscogsHandler({ query: "Madlib" });
      const data = JSON.parse(result.content[0].text);
      expect(data.results[0].title).toBe("Madlib");
      expect(data.results[0].id).toBe(1);
      expect(data.pagination).toBeDefined();
    });

    it("returns error on API failure", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
      const { searchDiscogsHandler } = await import("../src/servers/discogs.js");
      const result = await searchDiscogsHandler({ query: "test" });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBeDefined();
    });
  });

  describe("getArtistDiscogsHandler", () => {
    it("fetches artist profile", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 123, name: "Madlib", realname: "Otis Jackson Jr.",
          profile: "Producer from Oxnard",
          urls: ["http://madlib.com"],
          members: [{ id: 1, name: "Member A" }],
          aliases: [{ id: 2, name: "Quasimoto" }],
          images: [{ uri: "img1" }, { uri: "img2" }, { uri: "img3" }, { uri: "img4" }],
        }),
      });

      const { getArtistDiscogsHandler } = await import("../src/servers/discogs.js");
      const result = await getArtistDiscogsHandler({ artist_id: 123 });
      const data = JSON.parse(result.content[0].text);
      expect(data.name).toBe("Madlib");
      expect(data.realname).toBe("Otis Jackson Jr.");
      expect(data.images).toHaveLength(3); // capped at 3
    });
  });

  describe("getArtistReleasesHandler", () => {
    it("fetches artist discography", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          releases: [
            { id: 10, title: "Madvillainy", year: 2004, type: "master", role: "Main", format: "Vinyl", label: "Stones Throw", thumb: "http://img.jpg" },
          ],
          pagination: { page: 1, pages: 5 },
        }),
      });

      const { getArtistReleasesHandler } = await import("../src/servers/discogs.js");
      const result = await getArtistReleasesHandler({ artist_id: 123 });
      const data = JSON.parse(result.content[0].text);
      expect(data.releases[0].title).toBe("Madvillainy");
      expect(data.releases[0].year).toBe(2004);
      expect(data.pagination.pages).toBe(5);
    });
  });

  describe("getLabelHandler", () => {
    it("fetches label profile", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 50, name: "Stones Throw Records",
          profile: "Independent label from Los Angeles",
          contact_info: "info@stonesthrow.com",
          urls: ["http://stonesthrow.com"],
          sublabels: [{ id: 51, name: "Now-Again" }],
          parent_label: null,
        }),
      });

      const { getLabelHandler } = await import("../src/servers/discogs.js");
      const result = await getLabelHandler({ label_id: 50 });
      const data = JSON.parse(result.content[0].text);
      expect(data.name).toBe("Stones Throw Records");
      expect(data.sublabels[0].name).toBe("Now-Again");
    });
  });

  describe("getLabelReleasesHandler", () => {
    it("fetches label catalog", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          releases: [
            { id: 20, title: "Madvillainy", year: 2004, artist: "Madvillain", format: "LP", catno: "STH2065", thumb: "http://img.jpg" },
          ],
          pagination: { page: 1, pages: 10 },
        }),
      });

      const { getLabelReleasesHandler } = await import("../src/servers/discogs.js");
      const result = await getLabelReleasesHandler({ label_id: 50 });
      const data = JSON.parse(result.content[0].text);
      expect(data.releases[0].catno).toBe("STH2065");
      expect(data.releases[0].artist).toBe("Madvillain");
    });
  });

  describe("getMasterHandler", () => {
    it("fetches master release", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 30, title: "Madvillainy", year: 2004,
          artists: [{ name: "Madvillain" }],
          genres: ["Hip Hop"],
          styles: ["Abstract", "Experimental"],
          tracklist: [
            { position: "A1", title: "The Illest Villains", duration: "1:47" },
            { position: "A2", title: "Accordion", duration: "2:28" },
          ],
          main_release: 100,
          most_recent_release: 200,
        }),
      });

      const { getMasterHandler } = await import("../src/servers/discogs.js");
      const result = await getMasterHandler({ master_id: 30 });
      const data = JSON.parse(result.content[0].text);
      expect(data.title).toBe("Madvillainy");
      expect(data.tracklist).toHaveLength(2);
      expect(data.tracklist[0].position).toBe("A1");
      expect(data.genres).toContain("Hip Hop");
    });
  });

  describe("getMasterVersionsHandler", () => {
    it("fetches master versions", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          versions: [
            { id: 100, title: "Madvillainy", year: 2004, country: "US", format: "Vinyl", label: "Stones Throw", catno: "STH2065", thumb: "http://img.jpg" },
            { id: 101, title: "Madvillainy", year: 2014, country: "EU", format: "CD", label: "Stones Throw", catno: "STH2065CD", thumb: "http://img2.jpg" },
          ],
          pagination: { page: 1, pages: 3 },
        }),
      });

      const { getMasterVersionsHandler } = await import("../src/servers/discogs.js");
      const result = await getMasterVersionsHandler({ master_id: 30 });
      const data = JSON.parse(result.content[0].text);
      expect(data.versions).toHaveLength(2);
      expect(data.versions[1].country).toBe("EU");
    });
  });

  describe("getReleaseFullHandler", () => {
    it("fetches full release details", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 100, title: "Madvillainy", year: 2004,
          artists: [{ name: "Madvillain" }],
          labels: [{ name: "Stones Throw", catno: "STH2065" }],
          formats: [{ name: "Vinyl", qty: "2" }],
          genres: ["Hip Hop"],
          styles: ["Abstract"],
          tracklist: [
            { position: "A1", title: "The Illest Villains", duration: "1:47", extraartists: [{ name: "Madlib", role: "Producer" }] },
          ],
          notes: "Limited pressing",
          identifiers: [{ type: "Barcode", value: "123456" }],
          companies: [{ name: "Stones Throw", entity_type_name: "Pressed By" }],
        }),
      });

      const { getReleaseFullHandler } = await import("../src/servers/discogs.js");
      const result = await getReleaseFullHandler({ release_id: 100 });
      const data = JSON.parse(result.content[0].text);
      expect(data.title).toBe("Madvillainy");
      expect(data.tracklist[0].extraartists[0].role).toBe("Producer");
      expect(data.identifiers[0].type).toBe("Barcode");
      expect(data.companies[0].entity_type_name).toBe("Pressed By");
    });
  });

  describe("getMarketplaceStatsHandler", () => {
    it("fetches marketplace pricing stats", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          lowest_price: { value: 25.99, currency: "USD" },
          num_for_sale: 42,
          blocked_from_sale: false,
        }),
      });

      const { getMarketplaceStatsHandler } = await import("../src/servers/discogs.js");
      const result = await getMarketplaceStatsHandler({ release_id: 100 });
      const data = JSON.parse(result.content[0].text);
      expect(data.lowest_price.value).toBe(25.99);
      expect(data.num_for_sale).toBe(42);
      expect(data.blocked_from_sale).toBe(false);
    });
  });
});
