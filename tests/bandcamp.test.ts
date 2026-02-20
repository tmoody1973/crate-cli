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
});
