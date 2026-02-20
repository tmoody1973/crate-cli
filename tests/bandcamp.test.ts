import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("bandcamp", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("bandcampFetch", () => {
    it("fetches with correct User-Agent header", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "<html>test</html>",
      });
      const { bandcampFetch } = await import("../src/servers/bandcamp.js");
      const result = await bandcampFetch("https://bandcamp.com/test");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://bandcamp.com/test",
        expect.objectContaining({
          headers: expect.objectContaining({
            "User-Agent": "Crate/1.0 (music-research-agent)",
          }),
        }),
      );
      expect(result).toBe("<html>test</html>");
    });

    it("returns null on fetch failure", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
      const { bandcampFetch } = await import("../src/servers/bandcamp.js");
      const result = await bandcampFetch("https://bandcamp.com/bad");
      expect(result).toBeNull();
    });

    it("returns null on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      const { bandcampFetch } = await import("../src/servers/bandcamp.js");
      const result = await bandcampFetch("https://bandcamp.com/fail");
      expect(result).toBeNull();
    });
  });

  describe("extractPagedata", () => {
    it("extracts and parses URL-encoded pagedata blob", async () => {
      const blob = encodeURIComponent(JSON.stringify({ name: "Test Artist" }));
      const html = `<div id="pagedata" data-blob="${blob}"></div>`;
      const { extractPagedata } = await import("../src/servers/bandcamp.js");
      const result = extractPagedata(html);
      expect(result).toEqual({ name: "Test Artist" });
    });

    it("returns null when no pagedata div exists", async () => {
      const { extractPagedata } = await import("../src/servers/bandcamp.js");
      const result = extractPagedata("<html><body>No data</body></html>");
      expect(result).toBeNull();
    });

    it("returns null on malformed JSON", async () => {
      const html = `<div id="pagedata" data-blob="not%20json"></div>`;
      const { extractPagedata } = await import("../src/servers/bandcamp.js");
      const result = extractPagedata(html);
      expect(result).toBeNull();
    });
  });

  describe("extractTralbum", () => {
    it("extracts tralbum data from script attribute", async () => {
      const tralbum = JSON.stringify({
        trackinfo: [{ title: "Track 1", duration: 180 }],
      });
      const html = `<script data-tralbum='${tralbum}'></script>`;
      const { extractTralbum } = await import("../src/servers/bandcamp.js");
      const result = extractTralbum(html);
      expect(result).toEqual({
        trackinfo: [{ title: "Track 1", duration: 180 }],
      });
    });

    it("returns null when no tralbum data exists", async () => {
      const { extractTralbum } = await import("../src/servers/bandcamp.js");
      const result = extractTralbum("<html><body>No tralbum</body></html>");
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // searchBandcampHandler
  // -------------------------------------------------------------------------
  describe("searchBandcampHandler", () => {
    it("returns parsed search results", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <div class="result-items">
            <li class="searchresult band">
              <div class="result-info">
                <div class="heading"><a href="https://artist.bandcamp.com">Test Artist</a></div>
                <div class="subhead">band</div>
                <div class="itemurl"><a href="https://artist.bandcamp.com">artist.bandcamp.com</a></div>
                <div class="tags">electronic, ambient</div>
                <div class="location">Portland, Oregon</div>
              </div>
              <div class="art"><img src="https://f4.bcbits.com/img/123.jpg"></div>
            </li>
            <li class="searchresult album">
              <div class="result-info">
                <div class="heading"><a href="https://artist.bandcamp.com/album/test">Test Album</a></div>
                <div class="subhead">by Test Artist</div>
                <div class="itemurl"><a href="https://artist.bandcamp.com/album/test">artist.bandcamp.com</a></div>
                <div class="tags">electronic</div>
              </div>
              <div class="art"><img src="https://f4.bcbits.com/img/456.jpg"></div>
            </li>
          </div>
        `,
      });

      const { searchBandcampHandler } = await import("../src/servers/bandcamp.js");
      const result = await searchBandcampHandler({ query: "test artist" });
      const data = JSON.parse(result.content[0].text);

      expect(data.query).toBe("test artist");
      expect(data.result_count).toBe(2);
      expect(data.results[0].type).toBe("artist");
      expect(data.results[0].name).toBe("Test Artist");
      expect(data.results[0].url).toBe("https://artist.bandcamp.com");
      expect(data.results[1].type).toBe("album");
      expect(data.results[1].artist).toBe("Test Artist");
    });

    it("handles item_type filter in URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `<div class="result-items"></div>`,
      });

      const { searchBandcampHandler } = await import("../src/servers/bandcamp.js");
      await searchBandcampHandler({ query: "test", item_type: "album" });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain("item_type=a");
    });

    it("returns error on fetch failure", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const { searchBandcampHandler } = await import("../src/servers/bandcamp.js");
      const result = await searchBandcampHandler({ query: "test" });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // getArtistPageHandler
  // -------------------------------------------------------------------------
  describe("getArtistPageHandler", () => {
    it("returns artist profile from pagedata", async () => {
      const pagedata = encodeURIComponent(JSON.stringify({
        bio: { text: "An electronic artist from Portland." },
        name: "Test Artist",
        band_id: 12345,
        image_id: 67890,
        discography: [
          {
            title: "First Album",
            page_url: "/album/first",
            item_type: "album",
            release_date: "01 Jan 2024 00:00:00 GMT",
            art_id: 111,
          },
        ],
        bandLinks: [{ url: "https://twitter.com/artist" }],
      }));

      // First fetch: artist page HTML
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<div id="pagedata" data-blob="${pagedata}"></div>
           <p id="band-name-location"><span class="location">Portland, Oregon</span></p>`,
      });

      // Second fetch: RSS feed
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0"?>
          <rss version="2.0">
            <channel>
              <item>
                <title>New Release</title>
                <link>https://artist.bandcamp.com/album/new</link>
                <pubDate>Mon, 15 Jan 2024 00:00:00 GMT</pubDate>
              </item>
            </channel>
          </rss>`,
      });

      const { getArtistPageHandler } = await import("../src/servers/bandcamp.js");
      const result = await getArtistPageHandler({ url: "https://artist.bandcamp.com" });
      const data = JSON.parse(result.content[0].text);

      expect(data.name).toBe("Test Artist");
      expect(data.band_id).toBe(12345);
      expect(data.bio).toBe("An electronic artist from Portland.");
      expect(data.discography).toHaveLength(1);
      expect(data.discography[0].title).toBe("First Album");
      expect(data.discography[0].type).toBe("album");
      expect(data.links).toContain("https://twitter.com/artist");
      expect(data.recent_feed).toHaveLength(1);
      expect(data.recent_feed[0].title).toBe("New Release");
    });

    it("returns error on fetch failure", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      const { getArtistPageHandler } = await import("../src/servers/bandcamp.js");
      const result = await getArtistPageHandler({ url: "https://bad.bandcamp.com" });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBeDefined();
    });

    it("works without RSS feed", async () => {
      const pagedata = encodeURIComponent(JSON.stringify({
        name: "Minimal Artist",
        discography: [],
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `<div id="pagedata" data-blob="${pagedata}"></div>`,
      });

      // RSS feed fails
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      const { getArtistPageHandler } = await import("../src/servers/bandcamp.js");
      const result = await getArtistPageHandler({ url: "https://minimal.bandcamp.com" });
      const data = JSON.parse(result.content[0].text);

      expect(data.name).toBe("Minimal Artist");
      expect(data.recent_feed).toBeUndefined();
    });
  });

});
