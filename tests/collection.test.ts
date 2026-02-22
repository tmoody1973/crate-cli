// tests/collection.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { _setDbDir, closeAll } from "../src/utils/db.js";
import {
  _resetSchema,
  collectionAddHandler,
  collectionSearchHandler,
  collectionUpdateHandler,
  collectionRemoveHandler,
  collectionStatsHandler,
  collectionTagsHandler,
} from "../src/servers/collection.js";

async function parse(result: Promise<any>) {
  const r = await result;
  return JSON.parse(r.content[0].text);
}

describe("collection", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "crate-collection-test-"));
    _setDbDir(testDir);
    _resetSchema();
  });

  afterEach(() => {
    closeAll();
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("collection_add", () => {
    it("adds a record with minimal fields", async () => {
      const result = await parse(collectionAddHandler({ artist: "MF DOOM", title: "Mm..Food" }));
      expect(result.id).toBeDefined();
      expect(result.artist).toBe("MF DOOM");
      expect(result.status).toBe("added");
    });

    it("adds a record with all fields and tags", async () => {
      const result = await parse(
        collectionAddHandler({
          artist: "Madlib",
          title: "Shades of Blue",
          format: "vinyl",
          year: 2003,
          label: "Blue Note",
          rating: 5,
          notes: "Classic",
          status: "owned",
          tags: ["jazz", "hip-hop", "samples"],
        }),
      );
      expect(result.id).toBeDefined();
    });
  });

  describe("collection_search", () => {
    beforeEach(async () => {
      await collectionAddHandler({
        artist: "MF DOOM",
        title: "Mm..Food",
        format: "vinyl",
        year: 2004,
        status: "owned",
        tags: ["hip-hop", "abstract"],
      });
      await collectionAddHandler({
        artist: "Madlib",
        title: "Shades of Blue",
        format: "CD",
        year: 2003,
        label: "Blue Note",
        status: "wishlist",
        tags: ["jazz", "hip-hop"],
      });
    });

    it("searches by text query", async () => {
      const result = await parse(collectionSearchHandler({ query: "DOOM" }));
      expect(result.records).toHaveLength(1);
      expect(result.records[0].artist).toBe("MF DOOM");
    });

    it("searches by artist", async () => {
      const result = await parse(collectionSearchHandler({ artist: "Madlib" }));
      expect(result.records).toHaveLength(1);
    });

    it("filters by status", async () => {
      const result = await parse(collectionSearchHandler({ status: "wishlist" }));
      expect(result.records).toHaveLength(1);
      expect(result.records[0].title).toBe("Shades of Blue");
    });

    it("filters by tag", async () => {
      const result = await parse(collectionSearchHandler({ tag: "hip-hop" }));
      expect(result.records).toHaveLength(2);
    });

    it("filters by format", async () => {
      const result = await parse(collectionSearchHandler({ format: "vinyl" }));
      expect(result.records).toHaveLength(1);
    });

    it("returns tags as arrays", async () => {
      const result = await parse(collectionSearchHandler({ artist: "Madlib" }));
      expect(result.records[0].tags).toContain("jazz");
      expect(result.records[0].tags).toContain("hip-hop");
    });

    it("returns all records with no filters", async () => {
      const result = await parse(collectionSearchHandler({}));
      expect(result.records).toHaveLength(2);
    });

    it("respects limit", async () => {
      const result = await parse(collectionSearchHandler({ limit: 1 }));
      expect(result.records).toHaveLength(1);
    });
  });

  describe("collection_update", () => {
    it("updates fields on a record", async () => {
      const added = await parse(collectionAddHandler({ artist: "MF DOOM", title: "Mm..Food" }));
      const result = await parse(collectionUpdateHandler({ id: added.id, rating: 5, status: "owned" }));
      expect(result.status).toBe("updated");

      const search = await parse(collectionSearchHandler({ artist: "DOOM" }));
      expect(search.records[0].rating).toBe(5);
    });

    it("replaces tags when provided", async () => {
      const added = await parse(
        collectionAddHandler({ artist: "DOOM", title: "Born Like This", tags: ["hip-hop"] }),
      );
      await collectionUpdateHandler({ id: added.id, tags: ["industrial", "experimental"] });
      const search = await parse(collectionSearchHandler({ artist: "DOOM" }));
      expect(search.records[0].tags).toContain("industrial");
      expect(search.records[0].tags).not.toContain("hip-hop");
    });

    it("errors on nonexistent record", async () => {
      const result = await parse(collectionUpdateHandler({ id: 999, rating: 3 }));
      expect(result.error).toMatch(/not found/);
    });
  });

  describe("collection_remove", () => {
    it("removes a record and cascades tags", async () => {
      const added = await parse(
        collectionAddHandler({ artist: "DOOM", title: "Test", tags: ["hip-hop"] }),
      );
      const result = await parse(collectionRemoveHandler({ id: added.id }));
      expect(result.status).toBe("removed");

      const search = await parse(collectionSearchHandler({ artist: "DOOM" }));
      expect(search.records).toHaveLength(0);

      const tags = await parse(collectionTagsHandler({}));
      expect(tags.tags).toHaveLength(0);
    });

    it("errors on nonexistent record", async () => {
      const result = await parse(collectionRemoveHandler({ id: 999 }));
      expect(result.error).toMatch(/not found/);
    });
  });

  describe("collection_stats", () => {
    it("returns stats for empty collection", async () => {
      const result = await parse(collectionStatsHandler());
      expect(result.total).toBe(0);
    });

    it("returns comprehensive stats", async () => {
      await collectionAddHandler({
        artist: "A",
        title: "B",
        format: "vinyl",
        year: 1990,
        rating: 4,
        status: "owned",
        tags: ["jazz"],
      });
      await collectionAddHandler({
        artist: "C",
        title: "D",
        format: "CD",
        year: 2005,
        rating: 5,
        status: "wishlist",
        tags: ["jazz", "soul"],
      });
      const result = await parse(collectionStatsHandler());
      expect(result.total).toBe(2);
      expect(result.by_status).toHaveLength(2);
      expect(result.by_format).toHaveLength(2);
      expect(result.by_decade).toHaveLength(2);
      expect(result.avg_rating).toBe(4.5);
      expect(result.top_tags.length).toBeGreaterThan(0);
    });
  });

  describe("collection_tags", () => {
    it("returns tags with counts ordered by popularity", async () => {
      await collectionAddHandler({ artist: "A", title: "1", tags: ["jazz", "soul"] });
      await collectionAddHandler({ artist: "B", title: "2", tags: ["jazz", "funk"] });
      await collectionAddHandler({ artist: "C", title: "3", tags: ["jazz"] });
      const result = await parse(collectionTagsHandler({}));
      expect(result.tags[0].tag).toBe("jazz");
      expect(result.tags[0].count).toBe(3);
    });

    it("respects limit", async () => {
      await collectionAddHandler({ artist: "A", title: "1", tags: ["a", "b", "c"] });
      const result = await parse(collectionTagsHandler({ limit: 2 }));
      expect(result.tags).toHaveLength(2);
    });
  });
});
