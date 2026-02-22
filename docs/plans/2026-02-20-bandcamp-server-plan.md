# Bandcamp MCP Server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Bandcamp MCP server with 5 tools that extract structured data from Bandcamp using pagedata parsing, internal APIs, search scraping, oEmbed, and RSS feeds.

**Architecture:** Single file `src/servers/bandcamp.ts` following the existing server pattern (`createSdkMcpServer()` + `tool()` + Zod). Infrastructure layer handles rate limiting, fetch wrapping, and HTML data extraction. Each tool maps to one or more of the 5 extraction layers.

**Tech Stack:** TypeScript, cheerio (HTML parsing), rss-parser (RSS feeds), Zod (schemas), Vitest (testing)

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install cheerio and rss-parser**

Run: `npm install cheerio rss-parser`

**Step 2: Install cheerio types**

Run: `npm install -D @types/cheerio`

**Step 3: Verify installation**

Run: `cat package.json | grep -E "cheerio|rss-parser"`
Expected: Both packages appear in dependencies

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add cheerio and rss-parser for Bandcamp server"
```

---

### Task 2: Infrastructure — Rate Limiting + Fetch Wrapper + Result Helpers

**Files:**
- Create: `src/servers/bandcamp.ts`
- Create: `tests/bandcamp.test.ts`

**Step 1: Write the failing tests for infrastructure**

In `tests/bandcamp.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("bandcamp", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  // -------------------------------------------------------------------------
  // bandcampFetch
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // extractPagedata
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // extractTralbum
  // -------------------------------------------------------------------------
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
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/bandcamp.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal infrastructure implementation**

In `src/servers/bandcamp.ts`:

```typescript
// src/servers/bandcamp.ts
/**
 * Bandcamp tools — independent music marketplace data extraction.
 *
 * 5-layer extraction approach:
 *   1. Pagedata parsing (<div id="pagedata" data-blob="..."> + data-tralbum)
 *   2. Internal Discover API (bandcamp.com/api/discover/1/discover_web)
 *   3. Search page parsing (bandcamp.com/search?q=... via cheerio)
 *   4. oEmbed (bandcamp.com/services/oembed)
 *   5. RSS feeds ({artist}.bandcamp.com/feed via rss-parser)
 */

import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const USER_AGENT = "Crate/1.0 (music-research-agent)";

// ---------------------------------------------------------------------------
// Rate Limiting
// ---------------------------------------------------------------------------

let lastRequest = 0;
const MIN_DELAY_MS = 1500;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequest;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_DELAY_MS - elapsed));
  }
  lastRequest = Date.now();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ToolResult = { content: [{ type: "text"; text: string }] };

function toolResult(data: unknown): ToolResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }] };
}

// ---------------------------------------------------------------------------
// Fetch Wrapper
// ---------------------------------------------------------------------------

export async function bandcampFetch(url: string): Promise<string | null> {
  try {
    await rateLimit();
    const resp = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pagedata Extractor
// ---------------------------------------------------------------------------

export function extractPagedata(html: string): any | null {
  const match = html.match(/id="pagedata"\s+data-blob="([^"]*)"/);
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tralbum Extractor
// ---------------------------------------------------------------------------

export function extractTralbum(html: string): any | null {
  const match = html.match(/data-tralbum='([^']*)'/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Server export (tools added in subsequent tasks)
// ---------------------------------------------------------------------------

export const bandcampServer = createSdkMcpServer({
  name: "bandcamp",
  version: "1.0.0",
  tools: [],
});
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/bandcamp.test.ts`
Expected: All 7 tests PASS

**Step 5: Commit**

```bash
git add src/servers/bandcamp.ts tests/bandcamp.test.ts
git commit -m "feat(bandcamp): add infrastructure — fetch wrapper, pagedata/tralbum extractors"
```

---

### Task 3: Tool — search_bandcamp

**Files:**
- Modify: `src/servers/bandcamp.ts`
- Modify: `tests/bandcamp.test.ts`

**Step 1: Write the failing tests**

Append to `tests/bandcamp.test.ts` inside the outer `describe("bandcamp", ...)`:

```typescript
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
```

**Step 2: Run tests to verify new tests fail**

Run: `npx vitest run tests/bandcamp.test.ts`
Expected: New tests FAIL — `searchBandcampHandler` not exported

**Step 3: Implement search_bandcamp**

Add to `src/servers/bandcamp.ts` before the server export:

```typescript
import * as cheerio from "cheerio";

// ---------------------------------------------------------------------------
// Type mapping for search item_type parameter
// ---------------------------------------------------------------------------

const ITEM_TYPE_MAP: Record<string, string> = {
  artist: "b",
  album: "a",
  track: "t",
  label: "b", // labels use same code as bands
};

// ---------------------------------------------------------------------------
// search_bandcamp handler
// ---------------------------------------------------------------------------

export async function searchBandcampHandler(args: {
  query: string;
  item_type?: "artist" | "album" | "track" | "label";
}) {
  try {
    let url = `https://bandcamp.com/search?q=${encodeURIComponent(args.query)}`;
    if (args.item_type && ITEM_TYPE_MAP[args.item_type]) {
      url += `&item_type=${ITEM_TYPE_MAP[args.item_type]}`;
    }

    const html = await bandcampFetch(url);
    if (!html) throw new Error("Failed to fetch Bandcamp search results");

    const $ = cheerio.load(html);
    const results: any[] = [];

    $(".searchresult").each((_, el) => {
      const $el = $(el);
      const classes = $el.attr("class") ?? "";

      let type: string = "unknown";
      if (classes.includes("band")) type = "artist";
      else if (classes.includes("album")) type = "album";
      else if (classes.includes("track")) type = "track";
      else if (classes.includes("label")) type = "label";

      const name = $el.find(".heading a").text().trim();
      const itemUrl = $el.find(".heading a").attr("href") ?? "";
      const subhead = $el.find(".subhead").text().trim();
      const tagsText = $el.find(".tags").text().trim();
      const location = $el.find(".location").text().trim() || undefined;
      const imageUrl = $el.find(".art img").attr("src") || undefined;

      // Parse "by Artist" from subhead for albums/tracks
      let artist: string | undefined;
      let album: string | undefined;
      if (type === "album" || type === "track") {
        const byMatch = subhead.match(/^by\s+(.+)/i);
        if (byMatch) artist = byMatch[1].trim();
      }
      if (type === "track") {
        const fromMatch = subhead.match(/from\s+(.+)/i);
        if (fromMatch) album = fromMatch[1].trim();
      }

      const tags = tagsText
        ? tagsText.replace(/^tags:\s*/i, "").split(",").map((t: string) => t.trim()).filter(Boolean)
        : undefined;

      results.push({
        type,
        name,
        url: itemUrl,
        ...(artist && { artist }),
        ...(album && { album }),
        ...(imageUrl && { image_url: imageUrl }),
        ...(tags && tags.length > 0 && { tags }),
        ...(location && { location }),
      });
    });

    return toolResult({
      query: args.query,
      item_type: args.item_type ?? "all",
      result_count: results.length,
      results,
    });
  } catch (error) {
    return toolError(error);
  }
}

const searchBandcamp = tool(
  "search_bandcamp",
  "Search Bandcamp for artists, albums, tracks, or labels. " +
    "Returns names, URLs, tags, and locations. " +
    "Use for finding independent artists and releases on Bandcamp.",
  {
    query: z.string().describe("Search terms (e.g. 'Boards of Canada', 'lo-fi hip hop')"),
    item_type: z
      .enum(["artist", "album", "track", "label"])
      .optional()
      .describe("Filter by type (default: all types)"),
  },
  searchBandcampHandler,
);
```

Update the server export tools array:

```typescript
export const bandcampServer = createSdkMcpServer({
  name: "bandcamp",
  version: "1.0.0",
  tools: [searchBandcamp],
});
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/bandcamp.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/servers/bandcamp.ts tests/bandcamp.test.ts
git commit -m "feat(bandcamp): add search_bandcamp tool with cheerio parsing"
```

---

### Task 4: Tool — get_artist_page

**Files:**
- Modify: `src/servers/bandcamp.ts`
- Modify: `tests/bandcamp.test.ts`

**Step 1: Write the failing tests**

Append to `tests/bandcamp.test.ts` inside the outer describe:

```typescript
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
```

**Step 2: Run tests to verify new tests fail**

Run: `npx vitest run tests/bandcamp.test.ts`
Expected: New tests FAIL — `getArtistPageHandler` not exported

**Step 3: Implement get_artist_page**

Add to `src/servers/bandcamp.ts` after `searchBandcampHandler`:

```typescript
import RSSParser from "rss-parser";

const rssParser = new RSSParser();

// ---------------------------------------------------------------------------
// get_artist_page handler
// ---------------------------------------------------------------------------

export async function getArtistPageHandler(args: { url: string }) {
  try {
    const html = await bandcampFetch(args.url);
    if (!html) throw new Error(`Failed to fetch artist page: ${args.url}`);

    const pagedata = extractPagedata(html);
    const $ = cheerio.load(html);

    const name = pagedata?.name ?? $("meta[property='og:title']").attr("content") ?? "Unknown";
    const location = $(".location").first().text().trim() || undefined;
    const bio = pagedata?.bio?.text || undefined;
    const bandId = pagedata?.band_id || undefined;
    const imageUrl = pagedata?.image_id
      ? `https://f4.bcbits.com/img/${pagedata.image_id}_0.jpg`
      : undefined;

    const discography = (pagedata?.discography ?? []).map((item: any) => ({
      title: item.title,
      url: item.page_url
        ? new URL(item.page_url, args.url).href
        : undefined,
      type: item.item_type === "album" ? "album" : "track",
      release_date: item.release_date || undefined,
      art_url: item.art_id
        ? `https://f4.bcbits.com/img/a${item.art_id}_0.jpg`
        : undefined,
    }));

    const links = (pagedata?.bandLinks ?? [])
      .map((l: any) => l.url)
      .filter(Boolean);

    // Try RSS feed for recent releases
    let recentFeed: any[] | undefined;
    try {
      const feedUrl = args.url.replace(/\/$/, "") + "/feed";
      const feedHtml = await bandcampFetch(feedUrl);
      if (feedHtml) {
        const feed = await rssParser.parseString(feedHtml);
        recentFeed = feed.items.slice(0, 10).map((item) => ({
          title: item.title ?? "",
          url: item.link ?? "",
          date: item.pubDate ?? "",
        }));
      }
    } catch {
      // RSS feed optional — silently skip on failure
    }

    return toolResult({
      name,
      url: args.url,
      ...(location && { location }),
      ...(bio && { bio }),
      ...(imageUrl && { image_url: imageUrl }),
      ...(bandId && { band_id: bandId }),
      discography,
      ...(links.length > 0 && { links }),
      ...(recentFeed && recentFeed.length > 0 && { recent_feed: recentFeed }),
    });
  } catch (error) {
    return toolError(error);
  }
}

const getArtistPage = tool(
  "get_artist_page",
  "Get full artist/label profile from their Bandcamp page. " +
    "Returns bio, location, discography, external links, and recent releases. " +
    "Requires the artist's Bandcamp URL (e.g. https://artist.bandcamp.com).",
  {
    url: z.string().url().describe("Artist's Bandcamp URL (e.g. https://artist.bandcamp.com)"),
  },
  getArtistPageHandler,
);
```

Add `getArtistPage` to the tools array in the server export.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/bandcamp.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/servers/bandcamp.ts tests/bandcamp.test.ts
git commit -m "feat(bandcamp): add get_artist_page tool with pagedata + RSS"
```

---

### Task 5: Tool — get_album

**Files:**
- Modify: `src/servers/bandcamp.ts`
- Modify: `tests/bandcamp.test.ts`

**Step 1: Write the failing tests**

Append to `tests/bandcamp.test.ts` inside the outer describe:

```typescript
  // -------------------------------------------------------------------------
  // getAlbumHandler
  // -------------------------------------------------------------------------
  describe("getAlbumHandler", () => {
    it("returns album details with tracklist", async () => {
      const pagedata = encodeURIComponent(JSON.stringify({
        current: {
          title: "Test Album",
          artist: "Test Artist",
          about: "A great album.",
          credits: "Produced by Test Artist",
          release_date: "01 Mar 2024 00:00:00 GMT",
          minimum_price: 7.0,
          currency: "USD",
        },
        art_id: 999,
        album_release_date: "01 Mar 2024 00:00:00 GMT",
      }));

      const tralbum = JSON.stringify({
        trackinfo: [
          { track_num: 1, title: "Intro", duration: 62.5, artist: null },
          { track_num: 2, title: "Main Track", duration: 245.8, artist: "Featured Artist" },
        ],
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<div id="pagedata" data-blob="${pagedata}"></div>
           <script data-tralbum='${tralbum}'></script>
           <a class="tag" href="/tag/electronic">electronic</a>
           <a class="tag" href="/tag/ambient">ambient</a>
           <span class="label"><a href="https://label.bandcamp.com">Cool Label</a></span>`,
      });

      const { getAlbumHandler } = await import("../src/servers/bandcamp.js");
      const result = await getAlbumHandler({ url: "https://artist.bandcamp.com/album/test" });
      const data = JSON.parse(result.content[0].text);

      expect(data.title).toBe("Test Album");
      expect(data.artist).toBe("Test Artist");
      expect(data.about).toBe("A great album.");
      expect(data.credits).toBe("Produced by Test Artist");
      expect(data.tracks).toHaveLength(2);
      expect(data.tracks[0].number).toBe(1);
      expect(data.tracks[0].title).toBe("Intro");
      expect(data.tracks[0].duration_seconds).toBeCloseTo(62.5);
      expect(data.tracks[0].duration_formatted).toBe("1:03");
      expect(data.tracks[1].artist).toBe("Featured Artist");
      expect(data.price).toEqual({ amount: 7.0, currency: "USD" });
    });

    it("returns error on fetch failure", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      const { getAlbumHandler } = await import("../src/servers/bandcamp.js");
      const result = await getAlbumHandler({ url: "https://artist.bandcamp.com/album/bad" });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBeDefined();
    });
  });
```

**Step 2: Run tests to verify new tests fail**

Run: `npx vitest run tests/bandcamp.test.ts`
Expected: New tests FAIL — `getAlbumHandler` not exported

**Step 3: Implement get_album**

Add to `src/servers/bandcamp.ts`:

```typescript
// ---------------------------------------------------------------------------
// Duration formatter
// ---------------------------------------------------------------------------

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// get_album handler
// ---------------------------------------------------------------------------

export async function getAlbumHandler(args: { url: string }) {
  try {
    const html = await bandcampFetch(args.url);
    if (!html) throw new Error(`Failed to fetch album page: ${args.url}`);

    const pagedata = extractPagedata(html);
    const tralbum = extractTralbum(html);
    const $ = cheerio.load(html);

    const current = pagedata?.current ?? {};
    const title = current.title ?? $("meta[property='og:title']").attr("content") ?? "Unknown";
    const artist = current.artist ?? $("meta[property='og:site_name']").attr("content") ?? "Unknown";

    const tags: string[] = [];
    $("a.tag").each((_, el) => {
      const tag = $(el).text().trim();
      if (tag) tags.push(tag);
    });

    const label = $(".label a").first().text().trim() || undefined;
    const artUrl = pagedata?.art_id
      ? `https://f4.bcbits.com/img/a${pagedata.art_id}_0.jpg`
      : undefined;

    const tracks = (tralbum?.trackinfo ?? []).map((t: any) => ({
      number: t.track_num,
      title: t.title,
      ...(t.duration != null && {
        duration_seconds: t.duration,
        duration_formatted: formatDuration(t.duration),
      }),
      ...(t.artist && { artist: t.artist }),
    }));

    const price =
      current.minimum_price != null && current.currency
        ? { amount: current.minimum_price, currency: current.currency }
        : undefined;

    return toolResult({
      title,
      artist,
      url: args.url,
      ...(current.release_date && { release_date: current.release_date }),
      ...(artUrl && { art_url: artUrl }),
      ...(current.about && { about: current.about }),
      ...(current.credits && { credits: current.credits }),
      tags,
      ...(label && { label }),
      ...(price && { price }),
      tracks,
    });
  } catch (error) {
    return toolError(error);
  }
}

const getAlbum = tool(
  "get_album",
  "Get full album details from a Bandcamp album page. " +
    "Returns tracklist with durations, tags, credits, label, and pricing. " +
    "Requires the album's Bandcamp URL.",
  {
    url: z.string().url().describe("Album URL (e.g. https://artist.bandcamp.com/album/title)"),
  },
  getAlbumHandler,
);
```

Add `getAlbum` to the tools array.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/bandcamp.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/servers/bandcamp.ts tests/bandcamp.test.ts
git commit -m "feat(bandcamp): add get_album tool with tracklist + pagedata"
```

---

### Task 6: Tool — discover_music

**Files:**
- Modify: `src/servers/bandcamp.ts`
- Modify: `tests/bandcamp.test.ts`

**Step 1: Write the failing tests**

Append to `tests/bandcamp.test.ts`:

```typescript
  // -------------------------------------------------------------------------
  // discoverMusicHandler
  // -------------------------------------------------------------------------
  describe("discoverMusicHandler", () => {
    it("returns discover results from internal API", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          items: [
            {
              primary_text: "Ambient Album",
              secondary_text: "Ambient Artist",
              url_hints: { custom_domain: null, slug: "ambient-artist", item_type: "a", item_slug: "ambient-album" },
              art_id: 555,
              genre_text: "ambient",
              release_date: "01 Feb 2024 00:00:00 GMT",
            },
          ],
        }),
      });

      const { discoverMusicHandler } = await import("../src/servers/bandcamp.js");
      const result = await discoverMusicHandler({ tag: "ambient" });
      const data = JSON.parse(result.content[0].text);

      expect(data.tag).toBe("ambient");
      expect(data.result_count).toBe(1);
      expect(data.items[0].title).toBe("Ambient Album");
      expect(data.items[0].artist).toBe("Ambient Artist");
    });

    it("passes sort and format parameters", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ items: [] }),
      });

      const { discoverMusicHandler } = await import("../src/servers/bandcamp.js");
      await discoverMusicHandler({ tag: "electronic", sort: "new", format: "vinyl" });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain("sort=date");
      expect(calledUrl).toContain("format=vinyl");
    });

    it("returns error on fetch failure", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const { discoverMusicHandler } = await import("../src/servers/bandcamp.js");
      const result = await discoverMusicHandler({ tag: "electronic" });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBeDefined();
    });
  });
```

**Step 2: Run tests to verify new tests fail**

Run: `npx vitest run tests/bandcamp.test.ts`
Expected: New tests FAIL

**Step 3: Implement discover_music**

Add to `src/servers/bandcamp.ts`:

```typescript
const DISCOVER_URL = "https://bandcamp.com/api/discover/1/discover_web";

const SORT_MAP: Record<string, string> = {
  top: "pop",
  new: "date",
  rec: "rec",
};

// ---------------------------------------------------------------------------
// discover_music handler
// ---------------------------------------------------------------------------

export async function discoverMusicHandler(args: {
  tag: string;
  sort?: "top" | "new" | "rec";
  format?: "vinyl" | "cd" | "cassette" | "digital";
  location?: number;
}) {
  try {
    const sort = SORT_MAP[args.sort ?? "top"] ?? "pop";
    let url = `${DISCOVER_URL}?tag=${encodeURIComponent(args.tag)}&sort=${sort}`;
    if (args.format) url += `&format=${encodeURIComponent(args.format)}`;
    if (args.location) url += `&geoname_id=${args.location}`;

    const body = await bandcampFetch(url);
    if (!body) throw new Error(`Failed to fetch Bandcamp discover results for tag: ${args.tag}`);

    const json = JSON.parse(body);
    const items = (json.items ?? []).map((item: any) => {
      const hints = item.url_hints ?? {};
      const subdomain = hints.custom_domain ?? `${hints.slug}.bandcamp.com`;
      const itemUrl = hints.item_type === "a"
        ? `https://${subdomain}/album/${hints.item_slug}`
        : `https://${subdomain}/track/${hints.item_slug}`;

      return {
        title: item.primary_text,
        artist: item.secondary_text,
        url: itemUrl,
        ...(item.art_id && { art_url: `https://f4.bcbits.com/img/a${item.art_id}_0.jpg` }),
        ...(item.genre_text && { genre: item.genre_text }),
        ...(item.release_date && { release_date: item.release_date }),
      };
    });

    return toolResult({
      tag: args.tag,
      sort: args.sort ?? "top",
      result_count: items.length,
      items,
    });
  } catch (error) {
    return toolError(error);
  }
}

const discoverMusic = tool(
  "discover_music",
  "Browse Bandcamp's discovery system by genre/tag. " +
    "Returns trending and new releases for a tag with optional sort and format filters. " +
    "Great for finding new independent music by genre.",
  {
    tag: z.string().describe("Genre tag (e.g. 'ambient', 'hip-hop-rap', 'post-punk')"),
    sort: z.enum(["top", "new", "rec"]).optional().describe("Sort order (default: top)"),
    format: z.enum(["vinyl", "cd", "cassette", "digital"]).optional().describe("Physical format filter"),
    location: z.number().optional().describe("GeoNames ID for location filter"),
  },
  discoverMusicHandler,
);
```

Add `discoverMusic` to the tools array.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/bandcamp.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/servers/bandcamp.ts tests/bandcamp.test.ts
git commit -m "feat(bandcamp): add discover_music tool with internal API"
```

---

### Task 7: Tool — get_tag_info

**Files:**
- Modify: `src/servers/bandcamp.ts`
- Modify: `tests/bandcamp.test.ts`

**Step 1: Write the failing tests**

Append to `tests/bandcamp.test.ts`:

```typescript
  // -------------------------------------------------------------------------
  // getTagInfoHandler
  // -------------------------------------------------------------------------
  describe("getTagInfoHandler", () => {
    it("returns tag info from tag page", async () => {
      const pagedata = encodeURIComponent(JSON.stringify({
        hub: {
          description: "Electronic music encompasses a broad range...",
          related_tags: [
            { tag_norm_name: "ambient" },
            { tag_norm_name: "techno" },
            { tag_norm_name: "house" },
          ],
        },
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<div id="pagedata" data-blob="${pagedata}"></div>`,
      });

      const { getTagInfoHandler } = await import("../src/servers/bandcamp.js");
      const result = await getTagInfoHandler({ tag: "electronic" });
      const data = JSON.parse(result.content[0].text);

      expect(data.tag).toBe("electronic");
      expect(data.url).toBe("https://bandcamp.com/tag/electronic");
      expect(data.description).toContain("Electronic music");
      expect(data.related_tags).toContain("ambient");
      expect(data.related_tags).toContain("techno");
    });

    it("returns error on fetch failure", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      const { getTagInfoHandler } = await import("../src/servers/bandcamp.js");
      const result = await getTagInfoHandler({ tag: "nonexistent-tag" });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBeDefined();
    });
  });
```

**Step 2: Run tests to verify new tests fail**

Run: `npx vitest run tests/bandcamp.test.ts`
Expected: New tests FAIL

**Step 3: Implement get_tag_info**

Add to `src/servers/bandcamp.ts`:

```typescript
// ---------------------------------------------------------------------------
// get_tag_info handler
// ---------------------------------------------------------------------------

export async function getTagInfoHandler(args: { tag: string }) {
  try {
    const tagUrl = `https://bandcamp.com/tag/${encodeURIComponent(args.tag)}`;
    const html = await bandcampFetch(tagUrl);
    if (!html) throw new Error(`Failed to fetch tag page: ${args.tag}`);

    const pagedata = extractPagedata(html);
    const hub = pagedata?.hub ?? {};

    const relatedTags = (hub.related_tags ?? [])
      .map((t: any) => t.tag_norm_name)
      .filter(Boolean);

    return toolResult({
      tag: args.tag,
      url: tagUrl,
      ...(hub.description && { description: hub.description }),
      ...(relatedTags.length > 0 && { related_tags: relatedTags }),
    });
  } catch (error) {
    return toolError(error);
  }
}

const getTagInfo = tool(
  "get_tag_info",
  "Get information about a Bandcamp tag/genre. " +
    "Returns description and related tags. " +
    "Use to explore genre relationships and discover related scenes.",
  {
    tag: z.string().describe("Tag/genre name (e.g. 'electronic', 'vaporwave', 'math-rock')"),
  },
  getTagInfoHandler,
);
```

Add `getTagInfo` to the tools array. Final server export:

```typescript
export const bandcampServer = createSdkMcpServer({
  name: "bandcamp",
  version: "1.0.0",
  tools: [searchBandcamp, getArtistPage, getAlbum, discoverMusic, getTagInfo],
});
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/bandcamp.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/servers/bandcamp.ts tests/bandcamp.test.ts
git commit -m "feat(bandcamp): add get_tag_info tool"
```

---

### Task 8: Register Bandcamp Server

**Files:**
- Modify: `src/servers/index.ts`

**Step 1: Add import and register the server**

Add import at top of `src/servers/index.ts`:

```typescript
import { bandcampServer } from "./bandcamp.js";
```

Add to `getActiveServers()` after the wikipedia line:

```typescript
servers.bandcamp = bandcampServer; // Always available (no API key required)
```

Add `"bandcamp"` to the `allServers` array in `getServerStatus()`.

**Step 2: Run all tests to verify nothing breaks**

Run: `npx vitest run`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/servers/index.ts
git commit -m "feat(bandcamp): register server in index (always active)"
```

---

### Task 9: Update System Prompt

**Files:**
- Modify: `src/agent/system-prompt.ts`

**Step 1: Add Bandcamp data source section**

Add after the Wikipedia section in the system prompt string:

```typescript
### Bandcamp (always available, no API key)
Direct access to Bandcamp — the largest independent music marketplace. Strong on independent artists,
vinyl/cassette releases, genre tags, and pricing. Use these tools for:
- **search_bandcamp** — Search for artists, albums, tracks, or labels on Bandcamp.
- **get_artist_page** — Get artist/label profile: bio, location, discography, and recent releases.
- **get_album** — Get full album details: tracklist with durations, tags, credits, label, and pricing.
- **discover_music** — Browse Bandcamp's discovery by genre tag with sort and format filters.
- **get_tag_info** — Get genre/tag info: description, related tags, and top releases.
```

**Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/agent/system-prompt.ts
git commit -m "feat(bandcamp): add data source section to system prompt"
```

---

### Task 10: Update Tool Progress Messages

**Files:**
- Modify: `src/ui/app.ts`

**Step 1: Add Bandcamp tools to getToolProgressMessage()**

Add cases for Bandcamp tools in the `getToolProgressMessage()` function:

```typescript
case "search_bandcamp":
  return `Searching Bandcamp for "${input?.query ?? "music"}"...`;
case "get_artist_page":
  return `Fetching Bandcamp artist page...`;
case "get_album":
  return `Fetching album details from Bandcamp...`;
case "discover_music":
  return `Browsing Bandcamp ${input?.tag ?? "music"} releases...`;
case "get_tag_info":
  return `Looking up Bandcamp tag "${input?.tag ?? ""}"...`;
```

**Step 2: Commit**

```bash
git add src/ui/app.ts
git commit -m "feat(bandcamp): add tool progress messages for UI feedback"
```

---

### Task 11: Final Verification

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS across all test files

**Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Manual smoke test**

Run: `npx tsx src/cli.ts`
Then type: "Search Bandcamp for Boards of Canada"
Expected: Agent uses search_bandcamp tool, returns results

**Step 4: Final commit (if any cleanup needed)**

```bash
git add -A
git commit -m "feat(bandcamp): complete Bandcamp MCP server with 5 tools"
```
