// tests/web-search.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock fetch globally
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseResult(result: any) {
  return JSON.parse(result.content[0].text);
}

function okJson(data: any) {
  return {
    ok: true,
    status: 200,
    json: async () => data,
  };
}

function errorResp(status: number, statusText: string = "Error") {
  return {
    ok: false,
    status,
    statusText,
  };
}

// ---------------------------------------------------------------------------
// Env helpers — save/restore around each test
// ---------------------------------------------------------------------------

let savedTavily: string | undefined;
let savedExa: string | undefined;

beforeEach(() => {
  mockFetch.mockReset();
  savedTavily = process.env.TAVILY_API_KEY;
  savedExa = process.env.EXA_API_KEY;
});

afterEach(() => {
  if (savedTavily !== undefined) process.env.TAVILY_API_KEY = savedTavily;
  else delete process.env.TAVILY_API_KEY;
  if (savedExa !== undefined) process.env.EXA_API_KEY = savedExa;
  else delete process.env.EXA_API_KEY;
});

// ---------------------------------------------------------------------------
// hasTavily / hasExa
// ---------------------------------------------------------------------------

describe("hasTavily / hasExa", () => {
  it("returns false when env vars are unset", async () => {
    delete process.env.TAVILY_API_KEY;
    delete process.env.EXA_API_KEY;
    const { hasTavily, hasExa } = await import("../src/servers/web-search.js");
    expect(hasTavily()).toBe(false);
    expect(hasExa()).toBe(false);
  });

  it("returns true when env vars are set", async () => {
    process.env.TAVILY_API_KEY = "test-tavily-key";
    process.env.EXA_API_KEY = "test-exa-key";
    const { hasTavily, hasExa } = await import("../src/servers/web-search.js");
    expect(hasTavily()).toBe(true);
    expect(hasExa()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// searchWebHandler — Tavily provider
// ---------------------------------------------------------------------------

describe("searchWebHandler", () => {
  describe("Tavily provider", () => {
    beforeEach(() => {
      process.env.TAVILY_API_KEY = "test-tavily-key";
      delete process.env.EXA_API_KEY;
    });

    it("sends correct request and returns formatted results", async () => {
      mockFetch.mockResolvedValueOnce(
        okJson({
          results: [
            {
              title: "Milwaukee Jazz Scene 2025",
              url: "https://example.com/mke-jazz",
              content: "Article about the Milwaukee jazz scene...",
              score: 0.92,
            },
            {
              title: "Underground Jazz in the Midwest",
              url: "https://example.com/midwest-jazz",
              content: "Exploring Midwestern jazz...",
              score: 0.85,
            },
          ],
          response_time: 1.23,
          usage: { credits: 1 },
        })
      );

      const { searchWebHandler } = await import("../src/servers/web-search.js");
      const result = await searchWebHandler({
        query: "Milwaukee experimental jazz 2025",
        provider: "tavily",
        search_depth: "basic",
        topic: "general",
        max_results: 5,
      });

      const data = parseResult(result);
      expect(data.provider).toBe("tavily");
      expect(data.query).toBe("Milwaukee experimental jazz 2025");
      expect(data.result_count).toBe(2);
      expect(data.response_time).toBe(1.23);
      expect(data.credits_used).toBe(1);
      expect(data.results).toHaveLength(2);
      expect(data.results[0].title).toBe("Milwaukee Jazz Scene 2025");
      expect(data.results[0].score).toBe(0.92);

      // Verify fetch was called with correct URL and body
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.tavily.com/search",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer test-tavily-key",
          }),
        })
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.query).toBe("Milwaukee experimental jazz 2025");
      expect(body.search_depth).toBe("basic");
      expect(body.topic).toBe("general");
      expect(body.max_results).toBe(5);
      expect(body.include_answer).toBe(false);
      expect(body.include_raw_content).toBe(false);
    });

    it("passes optional parameters (time_range, domains)", async () => {
      mockFetch.mockResolvedValueOnce(okJson({ results: [] }));

      const { searchWebHandler } = await import("../src/servers/web-search.js");
      await searchWebHandler({
        query: "Detroit techno",
        provider: "tavily",
        search_depth: "advanced",
        topic: "news",
        time_range: "month",
        include_domains: ["residentadvisor.net", "pitchfork.com"],
        exclude_domains: ["spotify.com"],
        max_results: 3,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.time_range).toBe("month");
      expect(body.include_domains).toEqual(["residentadvisor.net", "pitchfork.com"]);
      expect(body.exclude_domains).toEqual(["spotify.com"]);
      expect(body.search_depth).toBe("advanced");
      expect(body.topic).toBe("news");
    });

    it("truncates long content to 1500 chars", async () => {
      const longContent = "x".repeat(3000);
      mockFetch.mockResolvedValueOnce(
        okJson({
          results: [{ title: "Long", url: "https://example.com", content: longContent }],
        })
      );

      const { searchWebHandler } = await import("../src/servers/web-search.js");
      const result = await searchWebHandler({
        query: "test",
        provider: "tavily",
        search_depth: "basic",
        topic: "general",
        max_results: 5,
      });

      const data = parseResult(result);
      expect(data.results[0].content.length).toBeLessThanOrEqual(1501); // 1500 + ellipsis char
      expect(data.results[0].content).toMatch(/…$/);
    });

    it("handles 401 error", async () => {
      mockFetch.mockResolvedValueOnce(errorResp(401));

      const { searchWebHandler } = await import("../src/servers/web-search.js");
      await expect(
        searchWebHandler({
          query: "test",
          provider: "tavily",
          search_depth: "basic",
          topic: "general",
          max_results: 5,
        })
      ).rejects.toThrow("Invalid TAVILY_API_KEY");
    });

    it("handles 429 rate limit error", async () => {
      mockFetch.mockResolvedValueOnce(errorResp(429));

      const { searchWebHandler } = await import("../src/servers/web-search.js");
      await expect(
        searchWebHandler({
          query: "test",
          provider: "tavily",
          search_depth: "basic",
          topic: "general",
          max_results: 5,
        })
      ).rejects.toThrow("Tavily rate limit reached");
    });

    it("handles generic API errors", async () => {
      mockFetch.mockResolvedValueOnce(errorResp(500, "Internal Server Error"));

      const { searchWebHandler } = await import("../src/servers/web-search.js");
      await expect(
        searchWebHandler({
          query: "test",
          provider: "tavily",
          search_depth: "basic",
          topic: "general",
          max_results: 5,
        })
      ).rejects.toThrow("Tavily API error: 500 Internal Server Error");
    });

    it("handles empty results", async () => {
      mockFetch.mockResolvedValueOnce(okJson({ results: [] }));

      const { searchWebHandler } = await import("../src/servers/web-search.js");
      const result = await searchWebHandler({
        query: "extremely obscure query",
        provider: "tavily",
        search_depth: "basic",
        topic: "general",
        max_results: 5,
      });

      const data = parseResult(result);
      expect(data.result_count).toBe(0);
      expect(data.results).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // searchWebHandler — Exa provider
  // -------------------------------------------------------------------------

  describe("Exa provider", () => {
    beforeEach(() => {
      delete process.env.TAVILY_API_KEY;
      process.env.EXA_API_KEY = "test-exa-key";
    });

    it("sends correct request and returns formatted results", async () => {
      mockFetch.mockResolvedValueOnce(
        okJson({
          results: [
            {
              title: "Labels Like Stones Throw",
              url: "https://example.com/labels",
              text: "A guide to independent hip-hop labels...",
              summary: "Overview of indie hip-hop labels",
              publishedDate: "2025-03-15",
              author: "Jane Doe",
            },
          ],
          searchType: "neural",
          costDollars: { total: 0.004 },
        })
      );

      const { searchWebHandler } = await import("../src/servers/web-search.js");
      const result = await searchWebHandler({
        query: "labels like Stones Throw",
        provider: "exa",
        search_depth: "basic",
        topic: "general",
        max_results: 5,
      });

      const data = parseResult(result);
      expect(data.provider).toBe("exa");
      expect(data.search_type).toBe("neural");
      expect(data.result_count).toBe(1);
      expect(data.cost).toBe(0.004);
      expect(data.results[0].title).toBe("Labels Like Stones Throw");
      expect(data.results[0].summary).toBe("Overview of indie hip-hop labels");
      expect(data.results[0].published_date).toBe("2025-03-15");
      expect(data.results[0].author).toBe("Jane Doe");

      // Verify Exa API call
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.exa.ai/search",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "x-api-key": "test-exa-key",
          }),
        })
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.query).toBe("labels like Stones Throw");
      expect(body.numResults).toBe(5);
      expect(body.text).toBe(true);
      expect(body.summary).toBe(true);
      expect(body.type).toBe("auto");
    });

    it("passes domain filters to Exa", async () => {
      mockFetch.mockResolvedValueOnce(okJson({ results: [] }));

      const { searchWebHandler } = await import("../src/servers/web-search.js");
      await searchWebHandler({
        query: "shoegaze",
        provider: "exa",
        search_depth: "basic",
        topic: "general",
        include_domains: ["bandcamp.com"],
        exclude_domains: ["youtube.com"],
        max_results: 3,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.includeDomains).toEqual(["bandcamp.com"]);
      expect(body.excludeDomains).toEqual(["youtube.com"]);
    });

    it("handles Exa 401 error", async () => {
      mockFetch.mockResolvedValueOnce(errorResp(401));

      const { searchWebHandler } = await import("../src/servers/web-search.js");
      await expect(
        searchWebHandler({
          query: "test",
          provider: "exa",
          search_depth: "basic",
          topic: "general",
          max_results: 5,
        })
      ).rejects.toThrow("Invalid EXA_API_KEY");
    });

    it("handles Exa 429 rate limit error", async () => {
      mockFetch.mockResolvedValueOnce(errorResp(429));

      const { searchWebHandler } = await import("../src/servers/web-search.js");
      await expect(
        searchWebHandler({
          query: "test",
          provider: "exa",
          search_depth: "basic",
          topic: "general",
          max_results: 5,
        })
      ).rejects.toThrow("Exa rate limit reached");
    });
  });

  // -------------------------------------------------------------------------
  // searchWebHandler — Provider fallback logic
  // -------------------------------------------------------------------------

  describe("provider fallback", () => {
    it("falls back to Exa when Tavily requested but only Exa available", async () => {
      delete process.env.TAVILY_API_KEY;
      process.env.EXA_API_KEY = "test-exa-key";

      mockFetch.mockResolvedValueOnce(okJson({ results: [], searchType: "auto" }));

      const { searchWebHandler } = await import("../src/servers/web-search.js");
      const result = await searchWebHandler({
        query: "test fallback",
        provider: "tavily",
        search_depth: "basic",
        topic: "general",
        max_results: 5,
      });

      const data = parseResult(result);
      expect(data.provider).toBe("exa");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.exa.ai/search",
        expect.anything()
      );
    });

    it("falls back to Tavily when Exa requested but only Tavily available", async () => {
      process.env.TAVILY_API_KEY = "test-tavily-key";
      delete process.env.EXA_API_KEY;

      mockFetch.mockResolvedValueOnce(okJson({ results: [] }));

      const { searchWebHandler } = await import("../src/servers/web-search.js");
      const result = await searchWebHandler({
        query: "test fallback",
        provider: "exa",
        search_depth: "basic",
        topic: "general",
        max_results: 5,
      });

      const data = parseResult(result);
      expect(data.provider).toBe("tavily");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.tavily.com/search",
        expect.anything()
      );
    });

    it("throws when no provider keys are configured", async () => {
      delete process.env.TAVILY_API_KEY;
      delete process.env.EXA_API_KEY;

      const { searchWebHandler } = await import("../src/servers/web-search.js");
      await expect(
        searchWebHandler({
          query: "test",
          provider: "tavily",
          search_depth: "basic",
          topic: "general",
          max_results: 5,
        })
      ).rejects.toThrow("No web search API key configured");
    });

    it("throws for exa provider when no keys configured", async () => {
      delete process.env.TAVILY_API_KEY;
      delete process.env.EXA_API_KEY;

      const { searchWebHandler } = await import("../src/servers/web-search.js");
      await expect(
        searchWebHandler({
          query: "test",
          provider: "exa",
          search_depth: "basic",
          topic: "general",
          max_results: 5,
        })
      ).rejects.toThrow("No web search API key configured");
    });
  });
});

// ---------------------------------------------------------------------------
// findSimilarHandler
// ---------------------------------------------------------------------------

describe("findSimilarHandler", () => {
  beforeEach(() => {
    process.env.EXA_API_KEY = "test-exa-key";
  });

  it("sends correct request and returns formatted results", async () => {
    mockFetch.mockResolvedValueOnce(
      okJson({
        results: [
          {
            title: "Leaving Records",
            url: "https://leavingrecords.bandcamp.com",
            text: "An experimental label from Los Angeles...",
            summary: "LA experimental label",
            publishedDate: "2024-06-01",
            author: null,
          },
          {
            title: "International Anthem",
            url: "https://intlanthem.bandcamp.com",
            text: "Chicago-based jazz label...",
            summary: "Chicago jazz and experimental",
            publishedDate: null,
            author: null,
          },
        ],
        costDollars: { total: 0.008 },
      })
    );

    const { findSimilarHandler } = await import("../src/servers/web-search.js");
    const result = await findSimilarHandler({
      url: "https://stonesthrough.bandcamp.com",
      num_results: 5,
    });

    const data = parseResult(result);
    expect(data.provider).toBe("exa");
    expect(data.source_url).toBe("https://stonesthrough.bandcamp.com");
    expect(data.result_count).toBe(2);
    expect(data.cost).toBe(0.008);
    expect(data.results[0].title).toBe("Leaving Records");
    expect(data.results[1].title).toBe("International Anthem");

    // Verify API call
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.exa.ai/findSimilar",
      expect.objectContaining({ method: "POST" })
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.url).toBe("https://stonesthrough.bandcamp.com");
    expect(body.numResults).toBe(5);
    expect(body.text).toBe(true);
    expect(body.summary).toBe(true);
  });

  it("passes domain filters", async () => {
    mockFetch.mockResolvedValueOnce(okJson({ results: [] }));

    const { findSimilarHandler } = await import("../src/servers/web-search.js");
    await findSimilarHandler({
      url: "https://example.com",
      num_results: 3,
      include_domains: ["bandcamp.com"],
      exclude_domains: ["spotify.com"],
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.includeDomains).toEqual(["bandcamp.com"]);
    expect(body.excludeDomains).toEqual(["spotify.com"]);
  });

  it("throws when EXA_API_KEY is not set", async () => {
    delete process.env.EXA_API_KEY;

    const { findSimilarHandler } = await import("../src/servers/web-search.js");
    await expect(
      findSimilarHandler({
        url: "https://example.com",
        num_results: 5,
      })
    ).rejects.toThrow("find_similar requires EXA_API_KEY");
  });

  it("handles API errors", async () => {
    mockFetch.mockResolvedValueOnce(errorResp(500, "Server Error"));

    const { findSimilarHandler } = await import("../src/servers/web-search.js");
    await expect(
      findSimilarHandler({
        url: "https://example.com",
        num_results: 5,
      })
    ).rejects.toThrow("Exa API error: 500 Server Error");
  });
});

// ---------------------------------------------------------------------------
// extractContentHandler
// ---------------------------------------------------------------------------

describe("extractContentHandler", () => {
  beforeEach(() => {
    process.env.TAVILY_API_KEY = "test-tavily-key";
  });

  it("sends correct request and returns extracted content", async () => {
    mockFetch.mockResolvedValueOnce(
      okJson({
        results: [
          {
            url: "https://www.westword.com/music/denver-scene",
            raw_content: "Denver's electronic music scene has exploded...",
          },
          {
            url: "https://www.chicagoreader.com/music/jazz",
            raw_content: "Chicago jazz continues to thrive...",
          },
        ],
        failed_results: [],
        usage: { credits: 1 },
      })
    );

    const { extractContentHandler } = await import("../src/servers/web-search.js");
    const result = await extractContentHandler({
      urls: [
        "https://www.westword.com/music/denver-scene",
        "https://www.chicagoreader.com/music/jazz",
      ],
      extract_depth: "basic",
    });

    const data = parseResult(result);
    expect(data.provider).toBe("tavily");
    expect(data.extracted).toBe(2);
    expect(data.failed).toBe(0);
    expect(data.credits_used).toBe(1);
    expect(data.results).toHaveLength(2);
    expect(data.results[0].url).toBe("https://www.westword.com/music/denver-scene");
    expect(data.results[0].content).toContain("Denver's electronic music scene");
    expect(data.results[0].failed).toBe(false);

    // Verify API call
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.tavily.com/extract",
      expect.objectContaining({ method: "POST" })
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.urls).toHaveLength(2);
    expect(body.extract_depth).toBe("basic");
  });

  it("handles mixed success and failure results", async () => {
    mockFetch.mockResolvedValueOnce(
      okJson({
        results: [
          {
            url: "https://example.com/good",
            raw_content: "Extracted content here",
          },
        ],
        failed_results: [
          {
            url: "https://example.com/broken",
            error: "Page not found",
          },
        ],
        usage: { credits: 1 },
      })
    );

    const { extractContentHandler } = await import("../src/servers/web-search.js");
    const result = await extractContentHandler({
      urls: ["https://example.com/good", "https://example.com/broken"],
      extract_depth: "basic",
    });

    const data = parseResult(result);
    expect(data.extracted).toBe(1);
    expect(data.failed).toBe(1);
    expect(data.results).toHaveLength(2);

    const success = data.results.find((r: any) => !r.failed);
    const failure = data.results.find((r: any) => r.failed);
    expect(success.url).toBe("https://example.com/good");
    expect(success.content).toBe("Extracted content here");
    expect(failure.url).toBe("https://example.com/broken");
    expect(failure.error).toBe("Page not found");
  });

  it("truncates extracted content to 3000 chars", async () => {
    const longContent = "y".repeat(5000);
    mockFetch.mockResolvedValueOnce(
      okJson({
        results: [{ url: "https://example.com", raw_content: longContent }],
        failed_results: [],
      })
    );

    const { extractContentHandler } = await import("../src/servers/web-search.js");
    const result = await extractContentHandler({
      urls: ["https://example.com"],
      extract_depth: "basic",
    });

    const data = parseResult(result);
    expect(data.results[0].content.length).toBeLessThanOrEqual(3001);
    expect(data.results[0].content).toMatch(/…$/);
  });

  it("falls back to content field when raw_content is missing", async () => {
    mockFetch.mockResolvedValueOnce(
      okJson({
        results: [{ url: "https://example.com", content: "Fallback content" }],
        failed_results: [],
      })
    );

    const { extractContentHandler } = await import("../src/servers/web-search.js");
    const result = await extractContentHandler({
      urls: ["https://example.com"],
      extract_depth: "basic",
    });

    const data = parseResult(result);
    expect(data.results[0].content).toBe("Fallback content");
  });

  it("throws when TAVILY_API_KEY is not set", async () => {
    delete process.env.TAVILY_API_KEY;

    const { extractContentHandler } = await import("../src/servers/web-search.js");
    await expect(
      extractContentHandler({
        urls: ["https://example.com"],
        extract_depth: "basic",
      })
    ).rejects.toThrow("extract_content requires TAVILY_API_KEY");
  });

  it("handles API errors", async () => {
    mockFetch.mockResolvedValueOnce(errorResp(401));

    const { extractContentHandler } = await import("../src/servers/web-search.js");
    await expect(
      extractContentHandler({
        urls: ["https://example.com"],
        extract_depth: "basic",
      })
    ).rejects.toThrow("Invalid TAVILY_API_KEY");
  });
});

// ---------------------------------------------------------------------------
// MUSIC_DOMAINS constant
// ---------------------------------------------------------------------------

describe("MUSIC_DOMAINS", () => {
  it("contains expected music research domains", async () => {
    const { MUSIC_DOMAINS } = await import("../src/servers/web-search.js");
    expect(MUSIC_DOMAINS).toContain("bandcamp.com");
    expect(MUSIC_DOMAINS).toContain("residentadvisor.net");
    expect(MUSIC_DOMAINS).toContain("pitchfork.com");
    expect(MUSIC_DOMAINS).toContain("discogs.com");
    expect(MUSIC_DOMAINS.length).toBeGreaterThanOrEqual(8);
  });
});
