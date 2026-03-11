import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Set required env var
process.env.TICKETMASTER_API_KEY = "test-tm-api-key";

describe("ticketmaster", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("searchEventsHandler", () => {
    it("returns shaped event data", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _embedded: {
            events: [
              {
                name: "Radiohead Live",
                dates: {
                  start: { localDate: "2026-06-15", localTime: "20:00:00" },
                  status: { code: "onsale" },
                },
                _embedded: {
                  venues: [{ name: "Madison Square Garden", city: { name: "New York" }, state: { stateCode: "NY" } }],
                  attractions: [{ name: "Radiohead" }],
                },
                priceRanges: [{ min: 75, max: 250, currency: "USD" }],
                url: "https://www.ticketmaster.com/event/1",
              },
            ],
          },
          page: { totalElements: 1 },
        }),
      });

      const { searchEventsHandler } = await import("../src/servers/ticketmaster.js");
      const result = await searchEventsHandler({ keyword: "Radiohead" });
      const data = JSON.parse(result.content[0].text);
      expect(data.events).toHaveLength(1);
      expect(data.events[0].name).toBe("Radiohead Live");
      expect(data.events[0].date).toBe("2026-06-15");
      expect(data.events[0].time).toBe("20:00:00");
      expect(data.events[0].venue).toBe("Madison Square Garden");
      expect(data.events[0].city).toBe("New York");
      expect(data.events[0].priceRange).toEqual({ min: 75, max: 250, currency: "USD" });
      expect(data.events[0].status).toBe("onsale");
      expect(data.events[0].url).toBe("https://www.ticketmaster.com/event/1");
      expect(data.events[0].artists).toEqual(["Radiohead"]);
    });

    it("applies classificationName=music filter", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ page: { totalElements: 0 } }),
      });

      const { searchEventsHandler } = await import("../src/servers/ticketmaster.js");
      await searchEventsHandler({ keyword: "test" });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain("classificationName=music");
    });

    it("handles empty results", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ page: { totalElements: 0 } }),
      });

      const { searchEventsHandler } = await import("../src/servers/ticketmaster.js");
      const result = await searchEventsHandler({ keyword: "xyznonexistent" });
      const data = JSON.parse(result.content[0].text);
      expect(data.events).toEqual([]);
      expect(data.total).toBe(0);
    });

    it("handles 429 rate limit gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
      });

      const { searchEventsHandler } = await import("../src/servers/ticketmaster.js");
      const result = await searchEventsHandler({ keyword: "Radiohead" });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain("rate limit");
    });

    it("filters by city and stateCode", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ page: { totalElements: 0 } }),
      });

      const { searchEventsHandler } = await import("../src/servers/ticketmaster.js");
      await searchEventsHandler({ keyword: "jazz", city: "Chicago", stateCode: "IL" });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain("city=Chicago");
      expect(calledUrl).toContain("stateCode=IL");
    });
  });

  describe("searchAttractionsHandler", () => {
    it("returns shaped attraction data", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _embedded: {
            attractions: [
              {
                name: "Radiohead",
                id: "K8vZ9171oZf",
                classifications: [
                  {
                    genre: { name: "Alternative" },
                    subGenre: { name: "Alternative Rock" },
                  },
                ],
                url: "https://www.ticketmaster.com/radiohead-tickets/artist/K8vZ9171oZf",
                upcomingEvents: { _total: 5 },
              },
            ],
          },
          page: { totalElements: 1 },
        }),
      });

      const { searchAttractionsHandler } = await import("../src/servers/ticketmaster.js");
      const result = await searchAttractionsHandler({ keyword: "Radiohead" });
      const data = JSON.parse(result.content[0].text);
      expect(data.attractions).toHaveLength(1);
      expect(data.attractions[0].name).toBe("Radiohead");
      expect(data.attractions[0].id).toBe("K8vZ9171oZf");
      expect(data.attractions[0].genre).toBe("Alternative");
      expect(data.attractions[0].subGenre).toBe("Alternative Rock");
      expect(data.attractions[0].url).toBe("https://www.ticketmaster.com/radiohead-tickets/artist/K8vZ9171oZf");
      expect(data.attractions[0].upcomingEvents).toBe(5);
    });
  });

  describe("searchVenuesHandler", () => {
    it("returns shaped venue data", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _embedded: {
            venues: [
              {
                name: "Madison Square Garden",
                city: { name: "New York" },
                state: { stateCode: "NY" },
                country: { countryCode: "US" },
                address: { line1: "4 Pennsylvania Plaza" },
                upcomingEvents: { _total: 42 },
              },
            ],
          },
          page: { totalElements: 1 },
        }),
      });

      const { searchVenuesHandler } = await import("../src/servers/ticketmaster.js");
      const result = await searchVenuesHandler({ keyword: "Madison Square Garden" });
      const data = JSON.parse(result.content[0].text);
      expect(data.venues).toHaveLength(1);
      expect(data.venues[0].name).toBe("Madison Square Garden");
      expect(data.venues[0].city).toBe("New York");
      expect(data.venues[0].state).toBe("NY");
      expect(data.venues[0].country).toBe("US");
      expect(data.venues[0].address).toBe("4 Pennsylvania Plaza");
      expect(data.venues[0].upcomingEvents).toBe(42);
    });
  });

  describe("getEventDetailsHandler", () => {
    it("returns full event details with venue, artists, presales, classification", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: "Radiohead - World Tour",
          dates: {
            start: { localDate: "2026-06-15", localTime: "20:00:00" },
            status: { code: "onsale" },
          },
          _embedded: {
            venues: [
              {
                name: "Madison Square Garden",
                city: { name: "New York" },
                state: { stateCode: "NY" },
                country: { countryCode: "US" },
                address: { line1: "4 Pennsylvania Plaza" },
                upcomingEvents: { _total: 42 },
              },
            ],
            attractions: [{ name: "Radiohead" }],
          },
          priceRanges: [{ min: 75, max: 250, currency: "USD" }],
          url: "https://www.ticketmaster.com/event/1",
          sales: {
            presales: [
              {
                name: "Artist Presale",
                startDateTime: "2026-05-01T10:00:00Z",
                endDateTime: "2026-05-03T10:00:00Z",
              },
            ],
          },
          seatmap: { staticUrl: "https://maps.ticketmaster.com/maps/seatmap.png" },
          classifications: [
            {
              genre: { name: "Alternative" },
              subGenre: { name: "Alternative Rock" },
              segment: { name: "Music" },
            },
          ],
        }),
      });

      const { getEventDetailsHandler } = await import("../src/servers/ticketmaster.js");
      const result = await getEventDetailsHandler({ eventId: "abc123" });
      const data = JSON.parse(result.content[0].text);
      expect(data.name).toBe("Radiohead - World Tour");
      expect(data.venue.name).toBe("Madison Square Garden");
      expect(data.venue.city).toBe("New York");
      expect(data.artists).toEqual(["Radiohead"]);
      expect(data.presales).toHaveLength(1);
      expect(data.presales[0].name).toBe("Artist Presale");
      expect(data.presales[0].startDateTime).toBe("2026-05-01T10:00:00Z");
      expect(data.seatmapUrl).toBe("https://maps.ticketmaster.com/maps/seatmap.png");
      expect(data.classification.genre).toBe("Alternative");
      expect(data.classification.subGenre).toBe("Alternative Rock");
      expect(data.classification.segment).toBe("Music");
    });
  });
});
