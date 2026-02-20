import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Set required env vars
process.env.GENIUS_ACCESS_TOKEN = "test-token";

describe("genius", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("rateLimit", () => {
    it("enforces minimum delay between requests", async () => {
      const { rateLimit } = await import("../src/servers/genius.js");
      const start = Date.now();
      await rateLimit();
      await rateLimit();
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(150);
    });
  });

  describe("geniusFetch", () => {
    it("throws when token is missing", async () => {
      const orig = process.env.GENIUS_ACCESS_TOKEN;
      delete process.env.GENIUS_ACCESS_TOKEN;
      const { geniusFetch } = await import("../src/servers/genius.js");
      await expect(geniusFetch("/test")).rejects.toThrow("GENIUS_ACCESS_TOKEN is required");
      process.env.GENIUS_ACCESS_TOKEN = orig;
    });
  });

  describe("searchSongsHandler", () => {
    it("searches and returns formatted results", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: {
            hits: [
              {
                result: {
                  id: 378195,
                  title: "Alright",
                  full_title: "Alright by Kendrick Lamar",
                  primary_artist: { id: 1421, name: "Kendrick Lamar" },
                  url: "https://genius.com/Kendrick-lamar-alright-lyrics",
                  release_date_for_display: "June 29, 2015",
                  song_art_image_thumbnail_url: "https://img.genius.com/thumb.jpg",
                },
              },
            ],
          },
        }),
      });

      const { searchSongsHandler } = await import("../src/servers/genius.js");
      const result = await searchSongsHandler({ query: "Alright Kendrick" });
      const data = JSON.parse(result.content[0].text);
      expect(data.hits[0].title).toBe("Alright");
      expect(data.hits[0].artist).toBe("Kendrick Lamar");
      expect(data.hits[0].id).toBe(378195);
    });

    it("returns error on API failure", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
      const { searchSongsHandler } = await import("../src/servers/genius.js");
      const result = await searchSongsHandler({ query: "test" });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBeDefined();
    });
  });

  describe("getSongHandler", () => {
    it("fetches full song details", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: {
            song: {
              id: 378195,
              title: "Alright",
              full_title: "Alright by Kendrick Lamar",
              url: "https://genius.com/Kendrick-lamar-alright-lyrics",
              release_date_for_display: "June 29, 2015",
              album: { id: 56037, name: "To Pimp a Butterfly", url: "https://genius.com/albums/Kendrick-lamar/To-pimp-a-butterfly" },
              primary_artist: { id: 1421, name: "Kendrick Lamar" },
              featured_artists: [],
              producer_artists: [{ id: 33078, name: "Pharrell Williams" }, { id: 144901, name: "Sounwave" }],
              writer_artists: [{ id: 1421, name: "Kendrick Lamar" }, { id: 33078, name: "Pharrell Williams" }],
              media: [{ provider: "youtube", url: "https://youtube.com/watch?v=Z-48u_uWMHY" }],
              song_relationships: [
                { relationship_type: "sampled_in", songs: [{ id: 999, full_title: "Some Remix" }] },
                { relationship_type: "cover_of", songs: [] },
              ],
              description: { plain: "Alright is the third single..." },
              recording_location: "No I.D.'s studio",
              apple_music_id: "998999888",
            },
          },
        }),
      });

      const { getSongHandler } = await import("../src/servers/genius.js");
      const result = await getSongHandler({ song_id: 378195 });
      const data = JSON.parse(result.content[0].text);
      expect(data.title).toBe("Alright");
      expect(data.album.name).toBe("To Pimp a Butterfly");
      expect(data.producer_artists).toHaveLength(2);
      expect(data.producer_artists[0].name).toBe("Pharrell Williams");
      expect(data.song_relationships).toHaveLength(1); // empty cover_of filtered out
      expect(data.song_relationships[0].type).toBe("sampled_in");
    });
  });

  describe("getSongAnnotationsHandler", () => {
    it("fetches song annotations", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: {
            referents: [
              {
                id: 5001,
                fragment: "We gon' be alright",
                annotations: [
                  {
                    id: 6001,
                    body: { plain: "This line became a protest anthem..." },
                    votes_total: 245,
                    verified: true,
                    authors: [{ user: { id: 100, name: "GeniusEditor" } }],
                  },
                ],
              },
            ],
          },
        }),
      });

      const { getSongAnnotationsHandler } = await import("../src/servers/genius.js");
      const result = await getSongAnnotationsHandler({ song_id: 378195 });
      const data = JSON.parse(result.content[0].text);
      expect(data.referents[0].fragment).toBe("We gon' be alright");
      expect(data.referents[0].annotations[0].verified).toBe(true);
      expect(data.referents[0].annotations[0].votes_total).toBe(245);
    });
  });

  describe("getArtistGeniusHandler", () => {
    it("fetches artist profile", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: {
            artist: {
              id: 1421,
              name: "Kendrick Lamar",
              url: "https://genius.com/artists/Kendrick-lamar",
              image_url: "https://img.genius.com/kendrick.jpg",
              description: { plain: "Kendrick Lamar Duckworth is an American rapper..." },
              facebook_name: "kendricklamar",
              twitter_name: "kendricklamar",
              instagram_name: "kendricklamar",
              alternate_names: ["K-Dot", "K.Dot", "Kung Fu Kenny"],
            },
          },
        }),
      });

      const { getArtistGeniusHandler } = await import("../src/servers/genius.js");
      const result = await getArtistGeniusHandler({ artist_id: 1421 });
      const data = JSON.parse(result.content[0].text);
      expect(data.name).toBe("Kendrick Lamar");
      expect(data.alternate_names).toContain("K-Dot");
      expect(data.twitter_name).toBe("kendricklamar");
    });
  });

  describe("getArtistSongsGeniusHandler", () => {
    it("fetches artist songs with pagination", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: {
            songs: [
              {
                id: 378195,
                title: "Alright",
                full_title: "Alright by Kendrick Lamar",
                url: "https://genius.com/Kendrick-lamar-alright-lyrics",
                release_date_for_display: "June 29, 2015",
                primary_artist: { id: 1421, name: "Kendrick Lamar" },
              },
              {
                id: 90479,
                title: "HUMBLE.",
                full_title: "HUMBLE. by Kendrick Lamar",
                url: "https://genius.com/Kendrick-lamar-humble-lyrics",
                release_date_for_display: "March 30, 2017",
                primary_artist: { id: 1421, name: "Kendrick Lamar" },
              },
            ],
            next_page: 2,
          },
        }),
      });

      const { getArtistSongsGeniusHandler } = await import("../src/servers/genius.js");
      const result = await getArtistSongsGeniusHandler({ artist_id: 1421 });
      const data = JSON.parse(result.content[0].text);
      expect(data.songs).toHaveLength(2);
      expect(data.songs[0].title).toBe("Alright");
      expect(data.songs[1].title).toBe("HUMBLE.");
      expect(data.next_page).toBe(2);
    });
  });

  describe("getAnnotationHandler", () => {
    it("fetches a specific annotation", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: {
            annotation: {
              id: 6001,
              body: { plain: "This line became a protest anthem at Black Lives Matter marches..." },
              verified: true,
              votes_total: 245,
              authors: [{ user: { id: 100, name: "GeniusEditor" } }],
              referent: { fragment: "We gon' be alright", song_id: 378195 },
            },
          },
        }),
      });

      const { getAnnotationHandler } = await import("../src/servers/genius.js");
      const result = await getAnnotationHandler({ annotation_id: 6001 });
      const data = JSON.parse(result.content[0].text);
      expect(data.id).toBe(6001);
      expect(data.verified).toBe(true);
      expect(data.referent.song_id).toBe(378195);
      expect(data.authors[0].name).toBe("GeniusEditor");
    });
  });
});
