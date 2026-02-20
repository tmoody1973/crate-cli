import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("wikipedia", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    // Clear Enterprise credentials by default (free-only mode)
    delete process.env.WIKIMEDIA_USERNAME;
    delete process.env.WIKIMEDIA_PASSWORD;
  });

  afterEach(async () => {
    const { resetTokenCache } = await import("../src/servers/wikipedia.js");
    resetTokenCache();
  });

  // -------------------------------------------------------------------------
  // stripHtml
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // cleanWikitext
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // hasEnterpriseCredentials
  // -------------------------------------------------------------------------
  describe("hasEnterpriseCredentials", () => {
    it("returns false when no credentials set", async () => {
      const { hasEnterpriseCredentials } = await import("../src/servers/wikipedia.js");
      expect(hasEnterpriseCredentials()).toBe(false);
    });

    it("returns false when only username set", async () => {
      process.env.WIKIMEDIA_USERNAME = "user";
      const { hasEnterpriseCredentials } = await import("../src/servers/wikipedia.js");
      expect(hasEnterpriseCredentials()).toBe(false);
    });

    it("returns true when both credentials set", async () => {
      process.env.WIKIMEDIA_USERNAME = "user";
      process.env.WIKIMEDIA_PASSWORD = "pass";
      const { hasEnterpriseCredentials } = await import("../src/servers/wikipedia.js");
      expect(hasEnterpriseCredentials()).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // getEnterpriseToken
  // -------------------------------------------------------------------------
  describe("getEnterpriseToken", () => {
    it("returns null when no credentials", async () => {
      const { getEnterpriseToken } = await import("../src/servers/wikipedia.js");
      const token = await getEnterpriseToken();
      expect(token).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("fetches token when credentials are set", async () => {
      process.env.WIKIMEDIA_USERNAME = "user";
      process.env.WIKIMEDIA_PASSWORD = "pass";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "jwt-123", expires_in: 3600 }),
      });

      const { getEnterpriseToken } = await import("../src/servers/wikipedia.js");
      const token = await getEnterpriseToken();
      expect(token).toBe("jwt-123");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://auth.enterprise.wikimedia.com/v1/login",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ username: "user", password: "pass" }),
        }),
      );
    });

    it("returns null on auth failure", async () => {
      process.env.WIKIMEDIA_USERNAME = "user";
      process.env.WIKIMEDIA_PASSWORD = "wrong";

      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

      const { getEnterpriseToken } = await import("../src/servers/wikipedia.js");
      const token = await getEnterpriseToken();
      expect(token).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // resetTokenCache
  // -------------------------------------------------------------------------
  describe("resetTokenCache", () => {
    it("clears cached token so next call re-fetches", async () => {
      process.env.WIKIMEDIA_USERNAME = "user";
      process.env.WIKIMEDIA_PASSWORD = "pass";

      // First call: auth succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "jwt-1", expires_in: 3600 }),
      });

      const { getEnterpriseToken, resetTokenCache } = await import("../src/servers/wikipedia.js");
      await getEnterpriseToken();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call: uses cache (no new fetch)
      const cached = await getEnterpriseToken();
      expect(cached).toBe("jwt-1");
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Reset cache, third call should re-fetch
      resetTokenCache();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "jwt-2", expires_in: 3600 }),
      });
      const fresh = await getEnterpriseToken();
      expect(fresh).toBe("jwt-2");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // searchArticlesHandler (uses free endpoint, no auth)
  // -------------------------------------------------------------------------
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

    it("does not send auth headers", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pages: [] }),
      });

      const { searchArticlesHandler } = await import("../src/servers/wikipedia.js");
      await searchArticlesHandler({ query: "test" });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers).not.toHaveProperty("Authorization");
    });

    it("returns error on failure", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: "Server Error" });
      const { searchArticlesHandler } = await import("../src/servers/wikipedia.js");
      const result = await searchArticlesHandler({ query: "test" });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // getSummaryHandler (uses free endpoint, no auth)
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // getArticleHandler — free-only mode (no Enterprise credentials)
  // -------------------------------------------------------------------------
  describe("getArticleHandler (free mode)", () => {
    it("returns cleaned article content via free API", async () => {
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

      expect(data.title).toBe("J_Dilla");
      expect(data.key).toBe("J_Dilla");
      expect(data.url).toBe("https://en.wikipedia.org/wiki/J_Dilla");
      expect(data.license).toBe("CC BY-SA 4.0");
      expect(data.source).toBe("free");
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
      expect(data.content.length).toBeLessThan(1100);
    });

    it("returns error on 404", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
      const { getArticleHandler } = await import("../src/servers/wikipedia.js");
      const result = await getArticleHandler({ title: "Nonexistent" });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // getArticleHandler — Enterprise mode (with credentials)
  // -------------------------------------------------------------------------
  describe("getArticleHandler (enterprise mode)", () => {
    beforeEach(() => {
      process.env.WIKIMEDIA_USERNAME = "user";
      process.env.WIKIMEDIA_PASSWORD = "pass";
    });

    it("uses Enterprise API when credentials are available", async () => {
      // First fetch: Enterprise auth
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "jwt-123", expires_in: 3600 }),
      });
      // Second fetch: Enterprise article
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: "J_Dilla",
          identifier: 12345,
          article_body: {
            wikitext: "'''J Dilla''' was an American [[hip hop]] producer.",
          },
        }),
      });

      const { getArticleHandler } = await import("../src/servers/wikipedia.js");
      const result = await getArticleHandler({ title: "J_Dilla" });
      const data = JSON.parse(result.content[0].text);

      expect(data.source).toBe("enterprise");
      expect(data.id).toBe(12345);
      expect(data.content).toContain("J Dilla");
      expect(data.content).not.toContain("'''");
    });

    it("falls back to free API when Enterprise fails", async () => {
      // First fetch: Enterprise auth succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "jwt-123", expires_in: 3600 }),
      });
      // Second fetch: Enterprise article fails
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      // Third fetch: Free API fallback
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          title: "J Dilla",
          id: 12345,
          key: "J_Dilla",
          source: "'''J Dilla''' was an American [[hip hop]] producer.",
          license: { title: "CC BY-SA 4.0" },
          latest: { timestamp: "2024-06-01T12:00:00Z" },
        }),
      });

      const { getArticleHandler } = await import("../src/servers/wikipedia.js");
      const result = await getArticleHandler({ title: "J_Dilla" });
      const data = JSON.parse(result.content[0].text);

      expect(data.source).toBe("free");
      expect(data.content).toContain("J Dilla");
    });

    it("falls back to free API when auth fails", async () => {
      // First fetch: Enterprise auth fails
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
      // Second fetch: Free API fallback
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          title: "J Dilla",
          id: 12345,
          key: "J_Dilla",
          source: "'''J Dilla''' content here.",
          license: { title: "CC BY-SA 4.0" },
          latest: {},
        }),
      });

      const { getArticleHandler } = await import("../src/servers/wikipedia.js");
      const result = await getArticleHandler({ title: "J_Dilla" });
      const data = JSON.parse(result.content[0].text);

      expect(data.source).toBe("free");
    });
  });
});
