// tests/tumblr.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { _setDbDir, closeAll, getDb } from "../src/utils/db.js";

// ---------------------------------------------------------------------------
// Mock global fetch for Tumblr API calls
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock child_process.exec (used by openBrowser)
vi.mock("node:child_process", () => ({ exec: vi.fn() }));

// ---------------------------------------------------------------------------
// Imports (after mock setup)
// ---------------------------------------------------------------------------

import {
  parseInlineFormatting,
  markdownToNpf,
  _resetSchema,
  connectTumblrHandler,
  postToTumblrHandler,
  tumblrBlogInfoHandler,
  disconnectTumblrHandler,
  tumblrStatusHandler,
  getAuth,
} from "../src/servers/tumblr.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseResult(result: any) {
  return JSON.parse(result.content[0].text);
}

function jsonResponse(data: any, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

// ---------------------------------------------------------------------------
// parseInlineFormatting (pure function)
// ---------------------------------------------------------------------------

describe("parseInlineFormatting", () => {
  it("returns plain text unchanged", () => {
    const { plainText, formatting } = parseInlineFormatting("Hello world");
    expect(plainText).toBe("Hello world");
    expect(formatting).toEqual([]);
  });

  it("extracts bold formatting", () => {
    const { plainText, formatting } = parseInlineFormatting("This is **bold** text");
    expect(plainText).toBe("This is bold text");
    expect(formatting).toEqual([{ start: 8, end: 12, type: "bold" }]);
  });

  it("extracts italic formatting", () => {
    const { plainText, formatting } = parseInlineFormatting("This is *italic* text");
    expect(plainText).toBe("This is italic text");
    expect(formatting).toEqual([{ start: 8, end: 14, type: "italic" }]);
  });

  it("extracts link formatting", () => {
    const { plainText, formatting } = parseInlineFormatting("Check [this](https://example.com) out");
    expect(plainText).toBe("Check this out");
    expect(formatting).toEqual([
      { start: 6, end: 10, type: "link", url: "https://example.com" },
    ]);
  });

  it("extracts code as small formatting", () => {
    const { plainText, formatting } = parseInlineFormatting("Use `npm install` here");
    expect(plainText).toBe("Use npm install here");
    expect(formatting).toEqual([{ start: 4, end: 15, type: "small" }]);
  });

  it("handles multiple inline styles", () => {
    const { plainText, formatting } = parseInlineFormatting("**Bold** and *italic*");
    expect(plainText).toBe("Bold and italic");
    expect(formatting).toHaveLength(2);
    expect(formatting[0]!.type).toBe("bold");
    expect(formatting[1]!.type).toBe("italic");
  });
});

// ---------------------------------------------------------------------------
// markdownToNpf (pure function)
// ---------------------------------------------------------------------------

describe("markdownToNpf", () => {
  it("converts a plain paragraph", () => {
    const blocks = markdownToNpf("Hello world");
    expect(blocks).toEqual([{ type: "text", text: "Hello world" }]);
  });

  it("converts ## heading to heading1", () => {
    const blocks = markdownToNpf("## My Heading");
    expect(blocks).toEqual([{ type: "text", subtype: "heading1", text: "My Heading" }]);
  });

  it("converts ### heading to heading2", () => {
    const blocks = markdownToNpf("### Sub Heading");
    expect(blocks).toEqual([{ type: "text", subtype: "heading2", text: "Sub Heading" }]);
  });

  it("converts blockquote", () => {
    const blocks = markdownToNpf("> This is a quote");
    expect(blocks).toEqual([{ type: "text", subtype: "quote", text: "This is a quote" }]);
  });

  it("converts multi-line blockquote", () => {
    const blocks = markdownToNpf("> Line one\n> Line two");
    expect(blocks).toEqual([{ type: "text", subtype: "quote", text: "Line one\nLine two" }]);
  });

  it("converts unordered list items", () => {
    const blocks = markdownToNpf("- First\n- Second");
    expect(blocks).toEqual([
      { type: "text", subtype: "unordered-list-item", text: "First" },
      { type: "text", subtype: "unordered-list-item", text: "Second" },
    ]);
  });

  it("converts ordered list items", () => {
    const blocks = markdownToNpf("1. First\n2. Second");
    expect(blocks).toEqual([
      { type: "text", subtype: "ordered-list-item", text: "First" },
      { type: "text", subtype: "ordered-list-item", text: "Second" },
    ]);
  });

  it("converts fenced code blocks to indented", () => {
    const blocks = markdownToNpf("```\nconst x = 1;\n```");
    expect(blocks).toEqual([{ type: "text", subtype: "indented", text: "const x = 1;" }]);
  });

  it("skips blank lines and horizontal rules", () => {
    const blocks = markdownToNpf("First\n\n---\n\nSecond");
    expect(blocks).toEqual([
      { type: "text", text: "First" },
      { type: "text", text: "Second" },
    ]);
  });

  it("includes formatting on blocks with inline styles", () => {
    const blocks = markdownToNpf("This is **bold** text");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.text).toBe("This is bold text");
    expect(blocks[0]!.formatting).toEqual([{ start: 8, end: 12, type: "bold" }]);
  });

  it("handles mixed content", () => {
    const md = [
      "## Influence Chain",
      "",
      "Pharoah Sanders → Don Cherry → Four Tet",
      "",
      "- First connection",
      "- Second connection",
    ].join("\n");

    const blocks = markdownToNpf(md);
    expect(blocks).toHaveLength(4);
    expect(blocks[0]!.subtype).toBe("heading1");
    expect(blocks[1]!.type).toBe("text");
    expect(blocks[2]!.subtype).toBe("unordered-list-item");
    expect(blocks[3]!.subtype).toBe("unordered-list-item");
  });
});

// ---------------------------------------------------------------------------
// Handler tests (SQLite + mocked fetch)
// ---------------------------------------------------------------------------

describe("tumblr handlers", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "crate-tumblr-test-"));
    _setDbDir(testDir);
    _resetSchema();
    mockFetch.mockReset();
    // Set env vars for consumer key/secret
    process.env.TUMBLR_CONSUMER_KEY = "test-consumer-key";
    process.env.TUMBLR_CONSUMER_SECRET = "test-consumer-secret";
  });

  afterEach(() => {
    closeAll();
    rmSync(testDir, { recursive: true, force: true });
    delete process.env.TUMBLR_CONSUMER_KEY;
    delete process.env.TUMBLR_CONSUMER_SECRET;
  });

  // Helper: seed auth row directly into the DB for tests that need a connected state
  function seedAuth(overrides: Partial<{
    oauth_token: string;
    oauth_token_secret: string;
    blog_name: string;
    blog_url: string;
    blog_uuid: string;
  }> = {}) {
    const d = getDb("tumblr");
    d.exec(`
      CREATE TABLE IF NOT EXISTS tumblr_auth (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        oauth_token TEXT NOT NULL,
        oauth_token_secret TEXT NOT NULL,
        blog_name TEXT NOT NULL,
        blog_url TEXT NOT NULL,
        blog_uuid TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tumblr_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tumblr_post_id TEXT NOT NULL,
        title TEXT NOT NULL,
        blog_name TEXT NOT NULL,
        post_url TEXT NOT NULL,
        category TEXT,
        tags TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
    const defaults = {
      oauth_token: "test-oauth-token",
      oauth_token_secret: "test-oauth-token-secret",
      blog_name: "testblog",
      blog_url: "https://testblog.tumblr.com/",
      blog_uuid: "t:abc123",
    };
    const auth = { ...defaults, ...overrides };
    d.prepare(
      "INSERT OR REPLACE INTO tumblr_auth (id, oauth_token, oauth_token_secret, blog_name, blog_url, blog_uuid) VALUES (1, ?, ?, ?, ?, ?)",
    ).run(auth.oauth_token, auth.oauth_token_secret, auth.blog_name, auth.blog_url, auth.blog_uuid);
  }

  // -----------------------------------------------------------------------
  // tumblr_status
  // -----------------------------------------------------------------------

  describe("tumblr_status", () => {
    it("returns not connected when no auth exists", async () => {
      const result = parseResult(await tumblrStatusHandler({} as any));
      expect(result.connected).toBe(false);
    });

    it("returns connected with blog info when auth exists", async () => {
      seedAuth();
      const result = parseResult(await tumblrStatusHandler({} as any));
      expect(result.connected).toBe(true);
      expect(result.blog_name).toBe("testblog");
      expect(result.blog_url).toBe("https://testblog.tumblr.com/");
    });
  });

  // -----------------------------------------------------------------------
  // disconnect_tumblr
  // -----------------------------------------------------------------------

  describe("disconnect_tumblr", () => {
    it("returns not_connected when already disconnected", async () => {
      const result = parseResult(await disconnectTumblrHandler({} as any));
      expect(result.status).toBe("not_connected");
    });

    it("removes credentials and returns disconnected", async () => {
      seedAuth();
      const result = parseResult(await disconnectTumblrHandler({} as any));
      expect(result.status).toBe("disconnected");
      expect(result.blog_name).toBe("testblog");

      // Verify auth is gone
      const status = parseResult(await tumblrStatusHandler({} as any));
      expect(status.connected).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // tumblr_blog_info
  // -----------------------------------------------------------------------

  describe("tumblr_blog_info", () => {
    it("returns not_connected when no auth", async () => {
      const result = parseResult(await tumblrBlogInfoHandler({} as any));
      expect(result.status).toBe("not_connected");
    });

    it("returns blog info with empty posts", async () => {
      seedAuth();
      const result = parseResult(await tumblrBlogInfoHandler({} as any));
      expect(result.blog_name).toBe("testblog");
      expect(result.post_count).toBe(0);
      expect(result.recent_posts).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // post_to_tumblr
  // -----------------------------------------------------------------------

  describe("post_to_tumblr", () => {
    it("errors when not connected", async () => {
      const result = parseResult(
        await postToTumblrHandler({
          title: "Test",
          content: "Content",
        }),
      );
      expect(result.error).toContain("Not connected to Tumblr");
    });

    it("creates a post and stores it locally", async () => {
      seedAuth();

      // Mock Tumblr API create post response
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          meta: { status: 201, msg: "Created" },
          response: { id: "12345678" },
        }),
      );

      const result = parseResult(
        await postToTumblrHandler({
          title: "Pharoah Sanders Deep Dive",
          content: "## Overview\n\nA legendary saxophonist.",
          tags: ["jazz", "spiritual"],
          category: "artist",
        }),
      );

      expect(result.status).toBe("published");
      expect(result.tumblr_post_id).toBe("12345678");
      expect(result.post_url).toContain("testblog.tumblr.com");

      // Verify stored in DB
      const info = parseResult(await tumblrBlogInfoHandler({} as any));
      expect(info.post_count).toBe(1);
      expect(info.recent_posts[0].title).toBe("Pharoah Sanders Deep Dive");
      expect(info.recent_posts[0].tags).toContain("artist");
      expect(info.recent_posts[0].tags).toContain("jazz");
      expect(info.recent_posts[0].tags).toContain("crate");
    });

    it("adds default tags (crate, music) to every post", async () => {
      seedAuth();

      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          meta: { status: 201, msg: "Created" },
          response: { id: "99999" },
        }),
      );

      await postToTumblrHandler({
        title: "Quick Note",
        content: "Just a thought.",
      });

      const info = parseResult(await tumblrBlogInfoHandler({} as any));
      const tags = info.recent_posts[0].tags;
      expect(tags).toContain("crate");
      expect(tags).toContain("music");
    });

    it("sends NPF content blocks to the API", async () => {
      seedAuth();

      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          meta: { status: 201, msg: "Created" },
          response: { id: "55555" },
        }),
      );

      await postToTumblrHandler({
        title: "Test Post",
        content: "**Bold** paragraph\n\n- Item one\n- Item two",
      });

      // Verify the fetch call sent proper NPF content
      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.content).toBeDefined();
      expect(body.content[0]).toEqual({ type: "text", subtype: "heading1", text: "Test Post" });
      // Should have paragraph + 2 list items after the title heading
      expect(body.content.length).toBeGreaterThanOrEqual(4);
      expect(body.state).toBe("published");
    });
  });

  // -----------------------------------------------------------------------
  // getAuth
  // -----------------------------------------------------------------------

  describe("getAuth", () => {
    it("returns credentials when connected", () => {
      seedAuth({ oauth_token: "my-token", oauth_token_secret: "my-secret" });
      const result = getAuth();
      expect(result.oauth_token).toBe("my-token");
      expect(result.oauth_token_secret).toBe("my-secret");
      expect(result.blog_name).toBe("testblog");
    });

    it("throws when not connected", () => {
      expect(() => getAuth()).toThrow("Not connected to Tumblr");
    });
  });

  // -----------------------------------------------------------------------
  // connect_tumblr (limited — OAuth flow requires HTTP server)
  // -----------------------------------------------------------------------

  describe("connect_tumblr", () => {
    it("returns already_connected when auth exists", async () => {
      seedAuth();
      const result = parseResult(await connectTumblrHandler({} as any));
      expect(result.status).toBe("already_connected");
      expect(result.blog_name).toBe("testblog");
    });
  });
});
