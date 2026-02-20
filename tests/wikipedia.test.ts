import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Set required env var
process.env.WIKIPEDIA_ACCESS_TOKEN = "test-wiki-token";

describe("wikipedia", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("stripHtml", () => {
    it("strips HTML tags and decodes entities", async () => {
      const { stripHtml } = await import("../src/servers/wikipedia.js");
      expect(stripHtml("<b>Bold</b> &amp; <i>italic</i>")).toBe("Bold & italic");
      expect(stripHtml("&lt;tag&gt; &quot;quoted&quot; &#039;apos&#039;")).toBe('<tag> "quoted" \'apos\'');
      expect(stripHtml("word&nbsp;word")).toBe("word word");
    });

    it("collapses whitespace", async () => {
      const { stripHtml } = await import("../src/servers/wikipedia.js");
      expect(stripHtml("<p>Hello</p>  <p>World</p>")).toBe("Hello World");
    });
  });

  describe("cleanWikitext", () => {
    it("converts wiki links to plain text", async () => {
      const { cleanWikitext } = await import("../src/servers/wikipedia.js");
      expect(cleanWikitext("[[Detroit techno]]")).toBe("Detroit techno");
      expect(cleanWikitext("[[Detroit techno|techno from Detroit]]")).toBe("techno from Detroit");
    });

    it("strips templates", async () => {
      const { cleanWikitext } = await import("../src/servers/wikipedia.js");
      expect(cleanWikitext("Before {{cite web|url=example.com}} after")).toBe("Before  after");
    });

    it("converts bold and italic markup", async () => {
      const { cleanWikitext } = await import("../src/servers/wikipedia.js");
      expect(cleanWikitext("'''bold''' and ''italic''")).toBe("bold and italic");
    });

    it("strips ref tags", async () => {
      const { cleanWikitext } = await import("../src/servers/wikipedia.js");
      expect(cleanWikitext("fact<ref>source</ref> here")).toBe("fact here");
      expect(cleanWikitext("fact<ref name=\"a\" /> here")).toBe("fact here");
    });

    it("converts section headers", async () => {
      const { cleanWikitext } = await import("../src/servers/wikipedia.js");
      const result = cleanWikitext("== Career ==\nSome text");
      expect(result).toContain("Career");
      expect(result).not.toContain("==");
    });

    it("removes category links", async () => {
      const { cleanWikitext } = await import("../src/servers/wikipedia.js");
      expect(cleanWikitext("text [[Category:Musicians]] more")).toBe("text  more");
    });
  });

  describe("wikiGet", () => {
    it("includes Bearer auth header", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pages: [] }),
      });
      const { wikiGet } = await import("../src/servers/wikipedia.js");
      await wikiGet("https://api.wikimedia.org/test");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.wikimedia.org/test",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-wiki-token",
          }),
        }),
      );
    });

    it("throws on 401 with helpful message", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
      const { wikiGet } = await import("../src/servers/wikipedia.js");
      await expect(wikiGet("https://api.wikimedia.org/test")).rejects.toThrow(
        "Invalid Wikipedia access token",
      );
    });

    it("throws on 404", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
      const { wikiGet } = await import("../src/servers/wikipedia.js");
      await expect(wikiGet("https://api.wikimedia.org/test")).rejects.toThrow(
        "Page not found on Wikipedia",
      );
    });

    it("throws on other HTTP errors", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: "Internal Server Error" });
      const { wikiGet } = await import("../src/servers/wikipedia.js");
      await expect(wikiGet("https://api.wikimedia.org/test")).rejects.toThrow(
        "Wikipedia API error: 500 Internal Server Error",
      );
    });
  });

  describe("searchArticlesHandler", () => {
    it("returns formatted search results", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          pages: [
            {
              title: "Madlib",
              key: "Madlib",
              description: "American rapper and record producer",
              excerpt: "<span>Otis Jackson Jr.</span>, known as <b>Madlib</b>",
              thumbnail: { url: "//upload.wikimedia.org/thumb/Madlib.jpg" },
            },
            {
              title: "Madvillain",
              key: "Madvillain",
              description: "Hip hop duo",
              excerpt: "<b>Madvillain</b> was a hip hop duo",
              thumbnail: null,
            },
          ],
        }),
      });

      const { searchArticlesHandler } = await import("../src/servers/wikipedia.js");
      const result = await searchArticlesHandler({ query: "Madlib" });
      const data = JSON.parse(result.content[0].text);

      expect(data.query).toBe("Madlib");
      expect(data.result_count).toBe(2);
      expect(data.pages[0].title).toBe("Madlib");
      expect(data.pages[0].description).toBe("American rapper and record producer");
      expect(data.pages[0].thumbnail).toBe("https://upload.wikimedia.org/thumb/Madlib.jpg");
      expect(data.pages[1].thumbnail).toBeNull();
      // Excerpt should be HTML-stripped
      expect(data.pages[0].excerpt).not.toContain("<span>");
      expect(data.pages[0].excerpt).toContain("Madlib");
    });

    it("returns error on failure", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
      const { searchArticlesHandler } = await import("../src/servers/wikipedia.js");
      const result = await searchArticlesHandler({ query: "test" });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBeDefined();
    });
  });

  describe("getSummaryHandler", () => {
    it("returns formatted summary", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          title: "Madlib",
          description: "American rapper and record producer",
          extract: "Otis Jackson Jr., known professionally as Madlib, is an American rapper.",
          content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Madlib" } },
          thumbnail: { source: "https://upload.wikimedia.org/thumb/Madlib.jpg" },
          timestamp: "2024-01-15T10:30:00Z",
          type: "standard",
        }),
      });

      const { getSummaryHandler } = await import("../src/servers/wikipedia.js");
      const result = await getSummaryHandler({ title: "Madlib" });
      const data = JSON.parse(result.content[0].text);

      expect(data.title).toBe("Madlib");
      expect(data.description).toBe("American rapper and record producer");
      expect(data.extract).toContain("Otis Jackson Jr.");
      expect(data.url).toBe("https://en.wikipedia.org/wiki/Madlib");
      expect(data.thumbnail).toBe("https://upload.wikimedia.org/thumb/Madlib.jpg");
    });

    it("handles 404 with helpful message", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
      const { getSummaryHandler } = await import("../src/servers/wikipedia.js");
      const result = await getSummaryHandler({ title: "Nonexistent_Article_XYZ" });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain("not found");
    });
  });

  describe("getArticleHandler", () => {
    it("returns cleaned article content", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          title: "J Dilla",
          id: 12345,
          key: "J_Dilla",
          source: "'''James Dewitt Yancey''' (February 7, 1974 – February 10, 2006), known as '''J Dilla''', was an American [[hip hop]] [[record producer]].",
          license: { title: "CC BY-SA 4.0" },
          latest: { id: 99999, timestamp: "2024-06-01T12:00:00Z" },
        }),
      });

      const { getArticleHandler } = await import("../src/servers/wikipedia.js");
      const result = await getArticleHandler({ title: "J_Dilla" });
      const data = JSON.parse(result.content[0].text);

      expect(data.title).toBe("J Dilla");
      expect(data.key).toBe("J_Dilla");
      expect(data.url).toBe("https://en.wikipedia.org/wiki/J_Dilla");
      expect(data.license).toBe("CC BY-SA 4.0");
      // Content should be cleaned wikitext
      expect(data.content).toContain("J Dilla");
      expect(data.content).toContain("hip hop");
      expect(data.content).not.toContain("'''");
      expect(data.content).not.toContain("[[");
      expect(data.truncated).toBe(false);
    });

    it("truncates long articles", async () => {
      const longSource = "word ".repeat(5000); // ~25000 chars
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          title: "Long Article",
          id: 1,
          key: "Long_Article",
          source: longSource,
          latest: {},
        }),
      });

      const { getArticleHandler } = await import("../src/servers/wikipedia.js");
      const result = await getArticleHandler({ title: "Long_Article", max_chars: 1000 });
      const data = JSON.parse(result.content[0].text);

      expect(data.truncated).toBe(true);
      expect(data.content).toContain("[... article truncated]");
      expect(data.content.length).toBeLessThan(1100); // 1000 + truncation notice
    });

    it("returns error on failure", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
      const { getArticleHandler } = await import("../src/servers/wikipedia.js");
      const result = await getArticleHandler({ title: "Nonexistent" });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBeDefined();
    });
  });
});
