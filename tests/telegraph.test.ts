// tests/telegraph.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { _setDbDir, closeAll } from "../src/utils/db.js";

// ---------------------------------------------------------------------------
// Mock global fetch for Telegraph API calls
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ---------------------------------------------------------------------------
// Imports (after mock setup)
// ---------------------------------------------------------------------------

import {
  markdownToNodes,
  _resetSchema,
  setupPageHandler,
  postToPageHandler,
  viewMyPageHandler,
  listEntriesHandler,
  deleteEntryHandler,
} from "../src/servers/telegraph.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseResult(result: any) {
  return JSON.parse(result.content[0].text);
}

function telegraphResponse(result: any, ok = true) {
  return {
    ok: () => true,
    json: async () => ({ ok, result }),
  };
}

function telegraphError(error: string) {
  return {
    ok: () => true,
    json: async () => ({ ok: false, error }),
  };
}

// ---------------------------------------------------------------------------
// markdownToNodes (pure function — no mocks needed)
// ---------------------------------------------------------------------------

describe("markdownToNodes", () => {
  it("converts a heading to h4", () => {
    const nodes = markdownToNodes("## My Heading");
    expect(nodes).toEqual([{ tag: "h4", children: ["My Heading"] }]);
  });

  it("converts ### heading to h4", () => {
    const nodes = markdownToNodes("### Sub Heading");
    expect(nodes).toEqual([{ tag: "h4", children: ["Sub Heading"] }]);
  });

  it("converts a plain paragraph", () => {
    const nodes = markdownToNodes("Hello world");
    expect(nodes).toEqual([{ tag: "p", children: ["Hello world"] }]);
  });

  it("converts bold text", () => {
    const nodes = markdownToNodes("This is **bold** text");
    expect(nodes).toEqual([
      { tag: "p", children: ["This is ", { tag: "b", children: ["bold"] }, " text"] },
    ]);
  });

  it("converts italic text", () => {
    const nodes = markdownToNodes("This is *italic* text");
    expect(nodes).toEqual([
      { tag: "p", children: ["This is ", { tag: "em", children: ["italic"] }, " text"] },
    ]);
  });

  it("converts links", () => {
    const nodes = markdownToNodes("Check [this](https://example.com) out");
    expect(nodes).toEqual([
      {
        tag: "p",
        children: [
          "Check ",
          { tag: "a", attrs: { href: "https://example.com" }, children: ["this"] },
          " out",
        ],
      },
    ]);
  });

  it("converts unordered lists", () => {
    const nodes = markdownToNodes("- First item\n- Second item\n- Third item");
    expect(nodes).toEqual([
      {
        tag: "ul",
        children: [
          { tag: "li", children: ["First item"] },
          { tag: "li", children: ["Second item"] },
          { tag: "li", children: ["Third item"] },
        ],
      },
    ]);
  });

  it("converts blockquotes", () => {
    const nodes = markdownToNodes("> This is a quote");
    expect(nodes).toEqual([{ tag: "blockquote", children: ["This is a quote"] }]);
  });

  it("converts horizontal rules", () => {
    const nodes = markdownToNodes("---");
    expect(nodes).toEqual([{ tag: "hr" }]);
  });

  it("skips blank lines", () => {
    const nodes = markdownToNodes("First\n\nSecond");
    expect(nodes).toEqual([
      { tag: "p", children: ["First"] },
      { tag: "p", children: ["Second"] },
    ]);
  });

  it("handles mixed content", () => {
    const md = [
      "## Influence Chain",
      "",
      "Pharoah Sanders → Don Cherry → Four Tet",
      "",
      "**Evidence:** Pitchfork review",
      "",
      "- First connection",
      "- Second connection",
    ].join("\n");

    const nodes = markdownToNodes(md);
    expect(nodes).toHaveLength(4);
    expect(nodes[0]).toEqual({ tag: "h4", children: ["Influence Chain"] });
    expect(nodes[1]!.tag).toBe("p");
    expect(nodes[2]!.tag).toBe("p");
    expect(nodes[3]!.tag).toBe("ul");
    expect((nodes[3] as any).children).toHaveLength(2);
  });

  it("handles asterisk-style list items", () => {
    const nodes = markdownToNodes("* Item one\n* Item two");
    expect(nodes).toEqual([
      {
        tag: "ul",
        children: [
          { tag: "li", children: ["Item one"] },
          { tag: "li", children: ["Item two"] },
        ],
      },
    ]);
  });

  it("handles multiple inline styles in one line", () => {
    const nodes = markdownToNodes("**Bold** and *italic* and [link](http://x.com)");
    expect(nodes).toHaveLength(1);
    const children = (nodes[0] as any).children;
    expect(children).toHaveLength(5);
    expect(children[0]).toEqual({ tag: "b", children: ["Bold"] });
    expect(children[2]).toEqual({ tag: "em", children: ["italic"] });
    expect(children[4]).toEqual({ tag: "a", attrs: { href: "http://x.com" }, children: ["link"] });
  });
});

// ---------------------------------------------------------------------------
// Handler tests (SQLite + mocked fetch)
// ---------------------------------------------------------------------------

describe("telegraph handlers", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "crate-telegraph-test-"));
    _setDbDir(testDir);
    _resetSchema();
    mockFetch.mockReset();
  });

  afterEach(() => {
    closeAll();
    rmSync(testDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // setup_page
  // -----------------------------------------------------------------------

  describe("setup_page", () => {
    it("creates an account and index page on first call", async () => {
      // Mock createAccount
      mockFetch.mockResolvedValueOnce(
        telegraphResponse({ access_token: "test-token-123" }),
      );
      // Mock createPage for index
      mockFetch.mockResolvedValueOnce(
        telegraphResponse({ path: "My-Crate-Digs-01-01", url: "https://telegra.ph/My-Crate-Digs-01-01" }),
      );

      const result = parseResult(await setupPageHandler({ author_name: "Test DJ" }));

      expect(result.status).toBe("created");
      expect(result.url).toBe("https://telegra.ph/My-Crate-Digs-01-01");
      expect(result.author_name).toBe("Test DJ");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("returns existing page on second call (idempotent)", async () => {
      // First call — setup
      mockFetch.mockResolvedValueOnce(
        telegraphResponse({ access_token: "test-token-123" }),
      );
      mockFetch.mockResolvedValueOnce(
        telegraphResponse({ path: "My-Crate-Digs-01-01", url: "https://telegra.ph/My-Crate-Digs-01-01" }),
      );
      await setupPageHandler({ author_name: "Test DJ" });

      // Second call — should return existing without API calls
      mockFetch.mockClear();
      const result = parseResult(await setupPageHandler({}));

      expect(result.status).toBe("already_setup");
      expect(result.url).toBe("https://telegra.ph/My-Crate-Digs-01-01");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("uses default name when none provided", async () => {
      mockFetch.mockResolvedValueOnce(
        telegraphResponse({ access_token: "tok" }),
      );
      mockFetch.mockResolvedValueOnce(
        telegraphResponse({ path: "Crate-Digger-01", url: "https://telegra.ph/Crate-Digger-01" }),
      );

      const result = parseResult(await setupPageHandler({}));
      expect(result.author_name).toBe("Crate Digger");
    });

    it("returns error when Telegraph API fails", async () => {
      mockFetch.mockResolvedValueOnce(telegraphError("FLOOD_WAIT"));

      const result = parseResult(await setupPageHandler({}));
      expect(result.error).toContain("Failed to create Telegraph account");
    });
  });

  // -----------------------------------------------------------------------
  // post_to_page
  // -----------------------------------------------------------------------

  describe("post_to_page", () => {
    async function setupAccount() {
      mockFetch.mockResolvedValueOnce(
        telegraphResponse({ access_token: "test-token" }),
      );
      mockFetch.mockResolvedValueOnce(
        telegraphResponse({ path: "Index-01", url: "https://telegra.ph/Index-01" }),
      );
      await setupPageHandler({ author_name: "DJ Test" });
      mockFetch.mockClear();
    }

    it("creates an entry page, stores it, and rebuilds index", async () => {
      await setupAccount();

      // Mock createPage for entry
      mockFetch.mockResolvedValueOnce(
        telegraphResponse({ path: "Entry-01", url: "https://telegra.ph/Entry-01" }),
      );
      // Mock editPage for index rebuild
      mockFetch.mockResolvedValueOnce(telegraphResponse({}));

      const result = parseResult(
        await postToPageHandler({
          title: "Pharoah Sanders Deep Dive",
          content: "## Overview\n\nA legendary saxophonist.",
          category: "artist",
        }),
      );

      expect(result.status).toBe("published");
      expect(result.url).toBe("https://telegra.ph/Entry-01");
      expect(result.title).toBe("Pharoah Sanders Deep Dive");
      expect(result.category).toBe("artist");
      expect(result.index_url).toBe("https://telegra.ph/Index-01");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("errors when no account is set up", async () => {
      const result = parseResult(
        await postToPageHandler({
          title: "Test",
          content: "Content",
        }),
      );

      expect(result.error).toContain("No Crate page set up yet");
    });

    it("posts without a category", async () => {
      await setupAccount();

      mockFetch.mockResolvedValueOnce(
        telegraphResponse({ path: "Entry-02", url: "https://telegra.ph/Entry-02" }),
      );
      mockFetch.mockResolvedValueOnce(telegraphResponse({}));

      const result = parseResult(
        await postToPageHandler({
          title: "Quick Note",
          content: "Just a thought.",
        }),
      );

      expect(result.status).toBe("published");
      expect(result.category).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // view_my_page
  // -----------------------------------------------------------------------

  describe("view_my_page", () => {
    it("returns not_setup when no account exists", async () => {
      const result = parseResult(await viewMyPageHandler({} as any));
      expect(result.status).toBe("not_setup");
    });

    it("returns page info and recent entries", async () => {
      // Setup account
      mockFetch.mockResolvedValueOnce(
        telegraphResponse({ access_token: "tok" }),
      );
      mockFetch.mockResolvedValueOnce(
        telegraphResponse({ path: "Index-01", url: "https://telegra.ph/Index-01" }),
      );
      await setupPageHandler({ author_name: "DJ Test" });
      mockFetch.mockClear();

      // Add an entry
      mockFetch.mockResolvedValueOnce(
        telegraphResponse({ path: "E1", url: "https://telegra.ph/E1" }),
      );
      mockFetch.mockResolvedValueOnce(telegraphResponse({}));
      await postToPageHandler({ title: "Entry One", content: "Content", category: "note" });
      mockFetch.mockClear();

      const result = parseResult(await viewMyPageHandler({} as any));

      expect(result.url).toBe("https://telegra.ph/Index-01");
      expect(result.author_name).toBe("DJ Test");
      expect(result.total_entries).toBe(1);
      expect(result.recent_entries).toHaveLength(1);
      expect(result.recent_entries[0].title).toBe("Entry One");
      expect(result.recent_entries[0].category).toBe("note");
    });
  });

  // -----------------------------------------------------------------------
  // list_entries
  // -----------------------------------------------------------------------

  describe("list_entries", () => {
    async function setupWithEntries() {
      // Setup account
      mockFetch.mockResolvedValueOnce(
        telegraphResponse({ access_token: "tok" }),
      );
      mockFetch.mockResolvedValueOnce(
        telegraphResponse({ path: "Idx", url: "https://telegra.ph/Idx" }),
      );
      await setupPageHandler({});
      mockFetch.mockClear();

      // Add entries with different categories
      for (const [title, cat] of [
        ["Influence A", "influence"],
        ["Artist B", "artist"],
        ["Influence C", "influence"],
      ] as const) {
        mockFetch.mockResolvedValueOnce(
          telegraphResponse({ path: `P-${title}`, url: `https://telegra.ph/P-${title}` }),
        );
        mockFetch.mockResolvedValueOnce(telegraphResponse({}));
        await postToPageHandler({ title, content: "Content", category: cat });
      }
      mockFetch.mockClear();
    }

    it("lists all entries", async () => {
      await setupWithEntries();
      const result = parseResult(await listEntriesHandler({}));

      expect(result.count).toBe(3);
      expect(result.entries).toHaveLength(3);
    });

    it("filters by category", async () => {
      await setupWithEntries();
      const result = parseResult(await listEntriesHandler({ category: "influence" }));

      expect(result.count).toBe(2);
      expect(result.entries.every((e: any) => e.category === "influence")).toBe(true);
    });

    it("respects limit parameter", async () => {
      await setupWithEntries();
      const result = parseResult(await listEntriesHandler({ limit: 1 }));

      expect(result.count).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // delete_entry
  // -----------------------------------------------------------------------

  describe("delete_entry", () => {
    it("removes entry and rebuilds index", async () => {
      // Setup
      mockFetch.mockResolvedValueOnce(
        telegraphResponse({ access_token: "tok" }),
      );
      mockFetch.mockResolvedValueOnce(
        telegraphResponse({ path: "Idx", url: "https://telegra.ph/Idx" }),
      );
      await setupPageHandler({});
      mockFetch.mockClear();

      // Add entry
      mockFetch.mockResolvedValueOnce(
        telegraphResponse({ path: "E1", url: "https://telegra.ph/E1" }),
      );
      mockFetch.mockResolvedValueOnce(telegraphResponse({}));
      await postToPageHandler({ title: "To Delete", content: "Gone soon", category: "note" });
      mockFetch.mockClear();

      // Get entry ID
      const listed = parseResult(await listEntriesHandler({}));
      const entryId = listed.entries[0].id;

      // Delete — should rebuild index
      mockFetch.mockResolvedValueOnce(telegraphResponse({})); // editPage for rebuild
      const result = parseResult(await deleteEntryHandler({ entry_id: entryId }));

      expect(result.status).toBe("removed");
      expect(result.title).toBe("To Delete");

      // Verify entry is gone
      const afterDelete = parseResult(await listEntriesHandler({}));
      expect(afterDelete.count).toBe(0);
    });

    it("errors when entry does not exist", async () => {
      const result = parseResult(await deleteEntryHandler({ entry_id: 9999 }));
      expect(result.error).toContain("not found");
    });
  });
});
