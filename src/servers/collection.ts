// src/servers/collection.ts
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { getDb } from "../utils/db.js";

type ToolResult = { content: [{ type: "text"; text: string }] };

function toolResult(data: unknown): ToolResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }] };
}

function ensureSchema(): void {
  const db = getDb("collection");
  db.exec(`
    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist TEXT NOT NULL,
      title TEXT NOT NULL,
      format TEXT,
      year INTEGER,
      label TEXT,
      rating INTEGER,
      notes TEXT,
      status TEXT DEFAULT 'owned',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tags (
      record_id INTEGER NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY (record_id, tag),
      FOREIGN KEY (record_id) REFERENCES records(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_records_artist ON records(artist);
    CREATE INDEX IF NOT EXISTS idx_records_status ON records(status);
    CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);
  `);
}

let schemaReady = false;
function db() {
  if (!schemaReady) {
    ensureSchema();
    schemaReady = true;
  }
  return getDb("collection");
}

/** Reset schema flag (for test isolation). */
export function _resetSchema(): void {
  schemaReady = false;
}

// --- Handlers ---

export async function collectionAddHandler(args: {
  artist: string;
  title: string;
  format?: string;
  year?: number;
  label?: string;
  rating?: number;
  notes?: string;
  status?: string;
  tags?: string[];
}): Promise<ToolResult> {
  try {
    const d = db();
    const result = d.transaction(() => {
      const info = d
        .prepare(
          `INSERT INTO records (artist, title, format, year, label, rating, notes, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          args.artist,
          args.title,
          args.format ?? null,
          args.year ?? null,
          args.label ?? null,
          args.rating ?? null,
          args.notes ?? null,
          args.status ?? "owned",
        );
      const id = info.lastInsertRowid;
      if (args.tags?.length) {
        const insertTag = d.prepare("INSERT INTO tags (record_id, tag) VALUES (?, ?)");
        for (const tag of args.tags) {
          insertTag.run(id, tag.toLowerCase().trim());
        }
      }
      return id;
    })();
    return toolResult({ id: result, artist: args.artist, title: args.title, status: "added" });
  } catch (error) {
    return toolError(error);
  }
}

export async function collectionSearchHandler(args: {
  query?: string;
  artist?: string;
  status?: string;
  tag?: string;
  format?: string;
  limit?: number;
}): Promise<ToolResult> {
  try {
    const d = db();
    const conditions: string[] = [];
    const params: any[] = [];

    if (args.query) {
      conditions.push("(r.artist LIKE ? OR r.title LIKE ? OR r.label LIKE ?)");
      const q = `%${args.query}%`;
      params.push(q, q, q);
    }
    if (args.artist) {
      conditions.push("r.artist LIKE ?");
      params.push(`%${args.artist}%`);
    }
    if (args.status) {
      conditions.push("r.status = ?");
      params.push(args.status);
    }
    if (args.format) {
      conditions.push("r.format LIKE ?");
      params.push(`%${args.format}%`);
    }

    let sql: string;
    if (args.tag) {
      conditions.push("t.tag = ?");
      params.push(args.tag.toLowerCase().trim());
      sql = `SELECT DISTINCT r.*, GROUP_CONCAT(t2.tag) as tags
             FROM records r
             JOIN tags t ON t.record_id = r.id
             LEFT JOIN tags t2 ON t2.record_id = r.id
             ${conditions.length ? "WHERE " + conditions.join(" AND ") : ""}
             GROUP BY r.id
             ORDER BY r.updated_at DESC
             LIMIT ?`;
    } else {
      sql = `SELECT r.*, GROUP_CONCAT(t.tag) as tags
             FROM records r
             LEFT JOIN tags t ON t.record_id = r.id
             ${conditions.length ? "WHERE " + conditions.join(" AND ") : ""}
             GROUP BY r.id
             ORDER BY r.updated_at DESC
             LIMIT ?`;
    }
    params.push(args.limit ?? 20);

    const rows = d.prepare(sql).all(...params);
    const records = (rows as any[]).map((r) => ({
      ...r,
      tags: r.tags ? r.tags.split(",") : [],
    }));
    return toolResult({ records, count: records.length });
  } catch (error) {
    return toolError(error);
  }
}

export async function collectionUpdateHandler(args: {
  id: number;
  artist?: string;
  title?: string;
  format?: string;
  year?: number;
  label?: string;
  rating?: number;
  notes?: string;
  status?: string;
  tags?: string[];
}): Promise<ToolResult> {
  try {
    const d = db();
    const result = d.transaction(() => {
      const sets: string[] = ["updated_at = datetime('now')"];
      const params: any[] = [];

      for (const [key, val] of Object.entries(args)) {
        if (key === "id" || key === "tags" || val === undefined) continue;
        sets.push(`${key} = ?`);
        params.push(val);
      }

      params.push(args.id);
      const info = d
        .prepare(`UPDATE records SET ${sets.join(", ")} WHERE id = ?`)
        .run(...params);

      if (info.changes === 0) {
        throw new Error(`Record with id ${args.id} not found`);
      }

      if (args.tags !== undefined) {
        d.prepare("DELETE FROM tags WHERE record_id = ?").run(args.id);
        const insertTag = d.prepare("INSERT INTO tags (record_id, tag) VALUES (?, ?)");
        for (const tag of args.tags) {
          insertTag.run(args.id, tag.toLowerCase().trim());
        }
      }

      return info.changes;
    })();
    return toolResult({ id: args.id, status: "updated" });
  } catch (error) {
    return toolError(error);
  }
}

export async function collectionRemoveHandler(args: { id: number }): Promise<ToolResult> {
  try {
    const d = db();
    const info = d.prepare("DELETE FROM records WHERE id = ?").run(args.id);
    if (info.changes === 0) {
      throw new Error(`Record with id ${args.id} not found`);
    }
    return toolResult({ id: args.id, status: "removed" });
  } catch (error) {
    return toolError(error);
  }
}

export async function collectionStatsHandler(): Promise<ToolResult> {
  try {
    const d = db();
    const total = (d.prepare("SELECT COUNT(*) as count FROM records").get() as any).count;

    const byStatus = d
      .prepare("SELECT status, COUNT(*) as count FROM records GROUP BY status ORDER BY count DESC")
      .all();
    const byFormat = d
      .prepare("SELECT format, COUNT(*) as count FROM records WHERE format IS NOT NULL GROUP BY format ORDER BY count DESC")
      .all();
    const byDecade = d
      .prepare(
        `SELECT (year / 10 * 10) as decade, COUNT(*) as count
         FROM records WHERE year IS NOT NULL
         GROUP BY decade ORDER BY decade`,
      )
      .all();
    const avgRating = (
      d.prepare("SELECT AVG(rating) as avg FROM records WHERE rating IS NOT NULL").get() as any
    ).avg;
    const topTags = d
      .prepare("SELECT tag, COUNT(*) as count FROM tags GROUP BY tag ORDER BY count DESC LIMIT 10")
      .all();

    return toolResult({
      total,
      by_status: byStatus,
      by_format: byFormat,
      by_decade: byDecade,
      avg_rating: avgRating ? Math.round(avgRating * 10) / 10 : null,
      top_tags: topTags,
    });
  } catch (error) {
    return toolError(error);
  }
}

export async function collectionTagsHandler(args: { limit?: number }): Promise<ToolResult> {
  try {
    const d = db();
    const tags = d
      .prepare("SELECT tag, COUNT(*) as count FROM tags GROUP BY tag ORDER BY count DESC LIMIT ?")
      .all(args.limit ?? 50);
    return toolResult({ tags });
  } catch (error) {
    return toolError(error);
  }
}

// --- Tool definitions ---

const collectionAdd = tool(
  "collection_add",
  "Add a record to the user's collection. Stores artist, title, format, year, label, rating, notes, status, and tags in local SQLite.",
  {
    artist: z.string().describe("Artist name"),
    title: z.string().describe("Album/release title"),
    format: z.string().optional().describe("Format (vinyl, CD, cassette, digital)"),
    year: z.number().optional().describe("Release year"),
    label: z.string().optional().describe("Record label"),
    rating: z.number().min(1).max(5).optional().describe("Rating 1-5"),
    notes: z.string().optional().describe("Personal notes"),
    status: z
      .enum(["owned", "wishlist", "sold", "ordered"])
      .optional()
      .describe("Collection status (default: owned)"),
    tags: z.array(z.string()).optional().describe("Tags (e.g. ['jazz', 'grail', '180g'])"),
  },
  collectionAddHandler,
);

const collectionSearch = tool(
  "collection_search",
  "Search the user's record collection. Filter by text query, artist, status, tag, or format. Returns matching records with tags.",
  {
    query: z.string().optional().describe("Text search across artist, title, and label"),
    artist: z.string().optional().describe("Filter by artist name"),
    status: z
      .enum(["owned", "wishlist", "sold", "ordered"])
      .optional()
      .describe("Filter by status"),
    tag: z.string().optional().describe("Filter by tag"),
    format: z.string().optional().describe("Filter by format"),
    limit: z.number().optional().describe("Max results (default 20)"),
  },
  collectionSearchHandler,
);

const collectionUpdate = tool(
  "collection_update",
  "Update a record in the collection by ID. Any fields provided will be updated; tags are replaced entirely if provided.",
  {
    id: z.number().describe("Record ID to update"),
    artist: z.string().optional().describe("New artist name"),
    title: z.string().optional().describe("New title"),
    format: z.string().optional().describe("New format"),
    year: z.number().optional().describe("New year"),
    label: z.string().optional().describe("New label"),
    rating: z.number().min(1).max(5).optional().describe("New rating 1-5"),
    notes: z.string().optional().describe("New notes"),
    status: z.enum(["owned", "wishlist", "sold", "ordered"]).optional().describe("New status"),
    tags: z.array(z.string()).optional().describe("Replace all tags"),
  },
  collectionUpdateHandler,
);

const collectionRemove = tool(
  "collection_remove",
  "Remove a record from the collection by ID. Also removes associated tags.",
  { id: z.number().describe("Record ID to remove") },
  collectionRemoveHandler,
);

const collectionStats = tool(
  "collection_stats",
  "Get collection statistics: total records, counts by status/format/decade, average rating, and top tags.",
  {},
  collectionStatsHandler,
);

const collectionTags = tool(
  "collection_tags",
  "List all tags in the collection with counts, ordered by most used.",
  { limit: z.number().optional().describe("Max tags to return (default 50)") },
  collectionTagsHandler,
);

// --- Server export ---

export const collectionServer = createSdkMcpServer({
  name: "collection",
  version: "1.0.0",
  tools: [
    collectionAdd,
    collectionSearch,
    collectionUpdate,
    collectionRemove,
    collectionStats,
    collectionTags,
  ],
});
