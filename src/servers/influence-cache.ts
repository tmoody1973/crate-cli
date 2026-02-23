// src/servers/influence-cache.ts
/**
 * Influence Cache MCP server — persists discovered artist relationships
 * to a local SQLite database so the influence graph grows organically.
 * On future queries the agent checks cache first, avoiding expensive
 * repeat web searches.
 *
 * Uses the same getDb() utility as collection.ts.
 */

import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { getDb } from "../utils/db.js";
import { renderInfluencePath, renderInlineChain } from "../utils/viz.js";
import type { PathStep } from "../utils/viz.js";

// ---------------------------------------------------------------------------
// Types
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
// Schema
// ---------------------------------------------------------------------------

function ensureSchema(): void {
  const d = getDb("influence");
  d.exec(`
    CREATE TABLE IF NOT EXISTS artists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      name_lower TEXT NOT NULL UNIQUE,
      genres TEXT,
      first_seen TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS artist_aliases (
      alias_lower TEXT PRIMARY KEY,
      artist_id INTEGER NOT NULL,
      FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS influence_edges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_artist_id INTEGER NOT NULL,
      to_artist_id INTEGER NOT NULL,
      relationship TEXT NOT NULL DEFAULT 'influenced',
      weight REAL NOT NULL DEFAULT 0.5,
      context TEXT,
      first_seen TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(from_artist_id, to_artist_id, relationship),
      FOREIGN KEY (from_artist_id) REFERENCES artists(id) ON DELETE CASCADE,
      FOREIGN KEY (to_artist_id) REFERENCES artists(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS edge_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      edge_id INTEGER NOT NULL,
      source_type TEXT NOT NULL,
      source_url TEXT,
      source_name TEXT,
      snippet TEXT,
      discovered_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (edge_id) REFERENCES influence_edges(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_artists_name_lower ON artists(name_lower);
    CREATE INDEX IF NOT EXISTS idx_edges_from ON influence_edges(from_artist_id);
    CREATE INDEX IF NOT EXISTS idx_edges_to ON influence_edges(to_artist_id);
    CREATE INDEX IF NOT EXISTS idx_edges_relationship ON influence_edges(relationship);
    CREATE INDEX IF NOT EXISTS idx_edge_sources_edge ON edge_sources(edge_id);
  `);
}

let schemaReady = false;
function db() {
  if (!schemaReady) {
    ensureSchema();
    schemaReady = true;
  }
  return getDb("influence");
}

/** Reset schema flag (for test isolation). */
export function _resetSchema(): void {
  schemaReady = false;
}

// ---------------------------------------------------------------------------
// Artist resolution
// ---------------------------------------------------------------------------

/**
 * Look up an artist by name (case-insensitive), checking aliases too.
 * Creates a new artist record if not found.
 */
function getOrCreateArtist(name: string, genres?: string): number {
  const d = db();
  const lower = name.toLowerCase().trim();

  // Check artists table
  const existing = d.prepare("SELECT id FROM artists WHERE name_lower = ?").get(lower) as
    | { id: number }
    | undefined;
  if (existing) return existing.id;

  // Check aliases
  const alias = d.prepare(
    "SELECT artist_id FROM artist_aliases WHERE alias_lower = ?",
  ).get(lower) as { artist_id: number } | undefined;
  if (alias) return alias.artist_id;

  // Create new artist
  const info = d
    .prepare("INSERT INTO artists (name, name_lower, genres) VALUES (?, ?, ?)")
    .run(name.trim(), lower, genres ?? null);
  return Number(info.lastInsertRowid);
}

// ---------------------------------------------------------------------------
// Handlers (exported for testing)
// ---------------------------------------------------------------------------

export async function cacheInfluenceHandler(args: {
  from_artist: string;
  to_artist: string;
  relationship?: string;
  weight?: number;
  context?: string;
  from_genres?: string;
  to_genres?: string;
  source_type?: string;
  source_url?: string;
  source_name?: string;
  snippet?: string;
}): Promise<ToolResult> {
  try {
    const d = db();
    const result = d.transaction(() => {
      const fromId = getOrCreateArtist(args.from_artist, args.from_genres);
      const toId = getOrCreateArtist(args.to_artist, args.to_genres);
      const rel = args.relationship ?? "influenced";
      const weight = args.weight ?? 0.5;

      // Upsert edge — on conflict keep MAX weight
      const edgeInfo = d
        .prepare(
          `INSERT INTO influence_edges (from_artist_id, to_artist_id, relationship, weight, context)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(from_artist_id, to_artist_id, relationship)
           DO UPDATE SET
             weight = MAX(influence_edges.weight, excluded.weight),
             context = COALESCE(excluded.context, influence_edges.context),
             updated_at = datetime('now')`,
        )
        .run(fromId, toId, rel, weight, args.context ?? null);

      // Get the edge ID (could be new or existing)
      const edgeId =
        edgeInfo.changes > 0 && edgeInfo.lastInsertRowid
          ? Number(edgeInfo.lastInsertRowid)
          : (
              d
                .prepare(
                  "SELECT id FROM influence_edges WHERE from_artist_id = ? AND to_artist_id = ? AND relationship = ?",
                )
                .get(fromId, toId, rel) as { id: number }
            ).id;

      // Append source if provided
      if (args.source_type) {
        d.prepare(
          `INSERT INTO edge_sources (edge_id, source_type, source_url, source_name, snippet)
           VALUES (?, ?, ?, ?, ?)`,
        ).run(
          edgeId,
          args.source_type,
          args.source_url ?? null,
          args.source_name ?? null,
          args.snippet ?? null,
        );
      }

      return { edgeId, fromId, toId };
    })();

    return toolResult({
      status: "cached",
      edge_id: result.edgeId,
      from: args.from_artist,
      to: args.to_artist,
      relationship: args.relationship ?? "influenced",
      weight: args.weight ?? 0.5,
    });
  } catch (error) {
    return toolError(error);
  }
}

export async function cacheBatchInfluencesHandler(args: {
  edges: Array<{
    from_artist: string;
    to_artist: string;
    relationship?: string;
    weight?: number;
    context?: string;
    source_type?: string;
    source_url?: string;
    source_name?: string;
    snippet?: string;
  }>;
}): Promise<ToolResult> {
  try {
    const d = db();
    const results = d.transaction(() => {
      const saved: Array<{ from: string; to: string; edge_id: number }> = [];
      for (const edge of args.edges) {
        const fromId = getOrCreateArtist(edge.from_artist);
        const toId = getOrCreateArtist(edge.to_artist);
        const rel = edge.relationship ?? "influenced";
        const weight = edge.weight ?? 0.5;

        const edgeInfo = d
          .prepare(
            `INSERT INTO influence_edges (from_artist_id, to_artist_id, relationship, weight, context)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(from_artist_id, to_artist_id, relationship)
             DO UPDATE SET
               weight = MAX(influence_edges.weight, excluded.weight),
               context = COALESCE(excluded.context, influence_edges.context),
               updated_at = datetime('now')`,
          )
          .run(fromId, toId, rel, weight, edge.context ?? null);

        const edgeId =
          edgeInfo.changes > 0 && edgeInfo.lastInsertRowid
            ? Number(edgeInfo.lastInsertRowid)
            : (
                d
                  .prepare(
                    "SELECT id FROM influence_edges WHERE from_artist_id = ? AND to_artist_id = ? AND relationship = ?",
                  )
                  .get(fromId, toId, rel) as { id: number }
              ).id;

        if (edge.source_type) {
          d.prepare(
            `INSERT INTO edge_sources (edge_id, source_type, source_url, source_name, snippet)
             VALUES (?, ?, ?, ?, ?)`,
          ).run(
            edgeId,
            edge.source_type,
            edge.source_url ?? null,
            edge.source_name ?? null,
            edge.snippet ?? null,
          );
        }

        saved.push({ from: edge.from_artist, to: edge.to_artist, edge_id: edgeId });
      }
      return saved;
    })();

    return toolResult({
      status: "cached",
      count: results.length,
      edges: results,
    });
  } catch (error) {
    return toolError(error);
  }
}

export async function lookupInfluencesHandler(args: {
  artist: string;
  direction?: string;
  relationship?: string;
  min_weight?: number;
  limit?: number;
}): Promise<ToolResult> {
  try {
    const d = db();
    const lower = args.artist.toLowerCase().trim();

    // Resolve artist ID (check name + aliases)
    const artistRow = d.prepare("SELECT id FROM artists WHERE name_lower = ?").get(lower) as
      | { id: number }
      | undefined;
    const aliasRow = !artistRow
      ? (d.prepare("SELECT artist_id FROM artist_aliases WHERE alias_lower = ?").get(lower) as
          | { artist_id: number }
          | undefined)
      : undefined;
    const artistId = artistRow?.id ?? aliasRow?.artist_id;

    if (!artistId) {
      return toolResult({ artist: args.artist, connections: [], count: 0, message: "Artist not found in cache" });
    }

    const conditions: string[] = [];
    const params: any[] = [];
    const direction = args.direction ?? "both";

    if (direction === "outgoing" || direction === "both") {
      conditions.push("e.from_artist_id = ?");
      params.push(artistId);
    }
    if (direction === "incoming" || direction === "both") {
      if (conditions.length > 0) {
        // Replace with OR for both directions
        conditions.length = 0;
        params.length = 0;
        conditions.push("(e.from_artist_id = ? OR e.to_artist_id = ?)");
        params.push(artistId, artistId);
      } else {
        conditions.push("e.to_artist_id = ?");
        params.push(artistId);
      }
    }

    if (args.relationship) {
      conditions.push("e.relationship = ?");
      params.push(args.relationship);
    }
    if (args.min_weight != null) {
      conditions.push("e.weight >= ?");
      params.push(args.min_weight);
    }

    const limit = args.limit ?? 50;
    params.push(limit);

    const sql = `
      SELECT e.id as edge_id, e.relationship, e.weight, e.context,
             fa.name as from_name, ta.name as to_name,
             e.from_artist_id, e.to_artist_id
      FROM influence_edges e
      JOIN artists fa ON fa.id = e.from_artist_id
      JOIN artists ta ON ta.id = e.to_artist_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY e.weight DESC
      LIMIT ?
    `;

    const rows = d.prepare(sql).all(...params) as any[];
    const connections = rows.map((r) => ({
      edge_id: r.edge_id,
      from: r.from_name,
      to: r.to_name,
      relationship: r.relationship,
      weight: r.weight,
      context: r.context,
      direction: r.from_artist_id === artistId ? "outgoing" : "incoming",
    }));

    return toolResult({ artist: args.artist, connections, count: connections.length });
  } catch (error) {
    return toolError(error);
  }
}

export async function findCachedPathHandler(args: {
  from_artist: string;
  to_artist: string;
  max_depth?: number;
}): Promise<ToolResult> {
  try {
    const d = db();
    const fromLower = args.from_artist.toLowerCase().trim();
    const toLower = args.to_artist.toLowerCase().trim();
    const maxDepth = args.max_depth ?? 5;

    // Resolve both artist IDs
    const fromRow = d.prepare("SELECT id, name FROM artists WHERE name_lower = ?").get(fromLower) as
      | { id: number; name: string }
      | undefined;
    const fromAlias = !fromRow
      ? (d.prepare(
          "SELECT a.id, a.name FROM artist_aliases al JOIN artists a ON a.id = al.artist_id WHERE al.alias_lower = ?",
        ).get(fromLower) as { id: number; name: string } | undefined)
      : undefined;

    const toRow = d.prepare("SELECT id, name FROM artists WHERE name_lower = ?").get(toLower) as
      | { id: number; name: string }
      | undefined;
    const toAlias = !toRow
      ? (d.prepare(
          "SELECT a.id, a.name FROM artist_aliases al JOIN artists a ON a.id = al.artist_id WHERE al.alias_lower = ?",
        ).get(toLower) as { id: number; name: string } | undefined)
      : undefined;

    const fromArtist = fromRow ?? fromAlias;
    const toArtist = toRow ?? toAlias;

    if (!fromArtist) {
      return toolResult({ from: args.from_artist, to: args.to_artist, path: [], message: `"${args.from_artist}" not found in cache` });
    }
    if (!toArtist) {
      return toolResult({ from: args.from_artist, to: args.to_artist, path: [], message: `"${args.to_artist}" not found in cache` });
    }

    // BFS via recursive CTE — searches both edge directions
    const pathRows = d
      .prepare(
        `WITH RECURSIVE bfs(artist_id, path, depth) AS (
           SELECT ?, CAST(? AS TEXT), 0
           UNION ALL
           SELECT
             CASE
               WHEN e.from_artist_id = bfs.artist_id THEN e.to_artist_id
               ELSE e.from_artist_id
             END,
             bfs.path || ',' || CASE
               WHEN e.from_artist_id = bfs.artist_id THEN CAST(e.to_artist_id AS TEXT)
               ELSE CAST(e.from_artist_id AS TEXT)
             END,
             bfs.depth + 1
           FROM bfs
           JOIN influence_edges e ON (e.from_artist_id = bfs.artist_id OR e.to_artist_id = bfs.artist_id)
           WHERE bfs.depth < ?
             AND INSTR(bfs.path, CAST(
               CASE
                 WHEN e.from_artist_id = bfs.artist_id THEN e.to_artist_id
                 ELSE e.from_artist_id
               END AS TEXT
             )) = 0
         )
         SELECT path, depth FROM bfs
         WHERE artist_id = ?
         ORDER BY depth ASC
         LIMIT 1`,
      )
      .get(fromArtist.id, String(fromArtist.id), maxDepth, toArtist.id) as
      | { path: string; depth: number }
      | undefined;

    if (!pathRows) {
      return toolResult({
        from: args.from_artist,
        to: args.to_artist,
        path: [],
        depth: 0,
        message: `No cached path found between "${args.from_artist}" and "${args.to_artist}" within depth ${maxDepth}.`,
      });
    }

    // Resolve path IDs to names and gather evidence
    const ids = pathRows.path.split(",").map(Number);
    const pathSteps: PathStep[] = [];

    for (let i = 0; i < ids.length; i++) {
      const artist = d.prepare("SELECT name FROM artists WHERE id = ?").get(ids[i]) as { name: string };
      const step: PathStep = { artist: artist.name };

      if (i < ids.length - 1) {
        // Find the edge between consecutive artists
        const edge = d
          .prepare(
            `SELECT relationship, weight, context FROM influence_edges
             WHERE (from_artist_id = ? AND to_artist_id = ?)
                OR (from_artist_id = ? AND to_artist_id = ?)
             ORDER BY weight DESC LIMIT 1`,
          )
          .get(ids[i], ids[i + 1], ids[i + 1], ids[i]) as
          | { relationship: string; weight: number; context: string | null }
          | undefined;

        if (edge) {
          step.connection = edge.relationship;
          step.evidence = edge.context ?? `weight: ${edge.weight}`;
        }
      }

      pathSteps.push(step);
    }

    const formatted = renderInfluencePath(pathSteps);
    const inline = renderInlineChain(pathSteps.map((s) => s.artist));

    return toolResult({
      from: args.from_artist,
      to: args.to_artist,
      path: pathSteps,
      depth: pathRows.depth,
      formatted_path: formatted,
      inline_path: inline,
    });
  } catch (error) {
    return toolError(error);
  }
}

export async function searchCachedArtistsHandler(args: {
  query: string;
  limit?: number;
}): Promise<ToolResult> {
  try {
    const d = db();
    const pattern = `%${args.query.toLowerCase().trim()}%`;
    const limit = args.limit ?? 20;

    const rows = d
      .prepare(
        `SELECT a.id, a.name, a.genres, a.first_seen,
                (SELECT COUNT(*) FROM influence_edges WHERE from_artist_id = a.id) as outgoing,
                (SELECT COUNT(*) FROM influence_edges WHERE to_artist_id = a.id) as incoming
         FROM artists a
         WHERE a.name_lower LIKE ?
         ORDER BY (outgoing + incoming) DESC
         LIMIT ?`,
      )
      .all(pattern, limit) as any[];

    const artists = rows.map((r) => ({
      id: r.id,
      name: r.name,
      genres: r.genres,
      first_seen: r.first_seen,
      connections: { outgoing: r.outgoing, incoming: r.incoming, total: r.outgoing + r.incoming },
    }));

    return toolResult({ query: args.query, artists, count: artists.length });
  } catch (error) {
    return toolError(error);
  }
}

export async function influenceGraphStatsHandler(): Promise<ToolResult> {
  try {
    const d = db();

    const totalArtists = (d.prepare("SELECT COUNT(*) as count FROM artists").get() as any).count;
    const totalEdges = (d.prepare("SELECT COUNT(*) as count FROM influence_edges").get() as any).count;
    const totalSources = (d.prepare("SELECT COUNT(*) as count FROM edge_sources").get() as any).count;
    const totalAliases = (d.prepare("SELECT COUNT(*) as count FROM artist_aliases").get() as any).count;

    const byRelationship = d
      .prepare(
        "SELECT relationship, COUNT(*) as count FROM influence_edges GROUP BY relationship ORDER BY count DESC",
      )
      .all();

    const bySourceType = d
      .prepare(
        "SELECT source_type, COUNT(*) as count FROM edge_sources GROUP BY source_type ORDER BY count DESC",
      )
      .all();

    const mostConnected = d
      .prepare(
        `SELECT a.name,
                (SELECT COUNT(*) FROM influence_edges WHERE from_artist_id = a.id) +
                (SELECT COUNT(*) FROM influence_edges WHERE to_artist_id = a.id) as total
         FROM artists a
         ORDER BY total DESC
         LIMIT 10`,
      )
      .all() as any[];

    const avgWeight = (
      d.prepare("SELECT AVG(weight) as avg FROM influence_edges").get() as any
    ).avg;

    return toolResult({
      total_artists: totalArtists,
      total_edges: totalEdges,
      total_sources: totalSources,
      total_aliases: totalAliases,
      by_relationship: byRelationship,
      by_source_type: bySourceType,
      most_connected: mostConnected.filter((r: any) => r.total > 0),
      avg_weight: avgWeight ? Math.round(avgWeight * 100) / 100 : null,
    });
  } catch (error) {
    return toolError(error);
  }
}

export async function addArtistAliasHandler(args: {
  alias: string;
  artist_name: string;
}): Promise<ToolResult> {
  try {
    const d = db();
    const aliasLower = args.alias.toLowerCase().trim();

    // Resolve the target artist
    const artistId = getOrCreateArtist(args.artist_name);

    // Check if alias already exists
    const existing = d.prepare("SELECT artist_id FROM artist_aliases WHERE alias_lower = ?").get(aliasLower) as
      | { artist_id: number }
      | undefined;
    if (existing) {
      if (existing.artist_id === artistId) {
        return toolResult({ status: "already_exists", alias: args.alias, artist: args.artist_name });
      }
      return toolError(`Alias "${args.alias}" already maps to a different artist`);
    }

    d.prepare("INSERT INTO artist_aliases (alias_lower, artist_id) VALUES (?, ?)").run(aliasLower, artistId);

    return toolResult({ status: "added", alias: args.alias, artist: args.artist_name, artist_id: artistId });
  } catch (error) {
    return toolError(error);
  }
}

export async function removeCachedEdgeHandler(args: { edge_id: number }): Promise<ToolResult> {
  try {
    const d = db();

    // Get edge details before removing
    const edge = d
      .prepare(
        `SELECT e.id, fa.name as from_name, ta.name as to_name, e.relationship
         FROM influence_edges e
         JOIN artists fa ON fa.id = e.from_artist_id
         JOIN artists ta ON ta.id = e.to_artist_id
         WHERE e.id = ?`,
      )
      .get(args.edge_id) as any | undefined;

    if (!edge) {
      throw new Error(`Edge with id ${args.edge_id} not found`);
    }

    // Delete sources first, then edge (foreign key cascade should handle this, but be explicit)
    d.transaction(() => {
      d.prepare("DELETE FROM edge_sources WHERE edge_id = ?").run(args.edge_id);
      d.prepare("DELETE FROM influence_edges WHERE id = ?").run(args.edge_id);
    })();

    return toolResult({
      status: "removed",
      edge_id: args.edge_id,
      from: edge.from_name,
      to: edge.to_name,
      relationship: edge.relationship,
    });
  } catch (error) {
    return toolError(error);
  }
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const cacheInfluence = tool(
  "cache_influence",
  "Save a discovered influence relationship to the local cache. Upserts: if the edge already exists, updates weight to MAX and appends source evidence. Use after discovering a connection via reviews, Last.fm, MusicBrainz, or web search.",
  {
    from_artist: z.string().max(200).describe("Artist who influenced (source of influence)"),
    to_artist: z.string().max(200).describe("Artist who was influenced (target)"),
    relationship: z
      .enum(["influenced", "co_mention", "collaboration", "sample", "similar", "bridge"])
      .optional()
      .describe("Type of relationship (default: influenced)"),
    weight: z.number().min(0).max(1).optional().describe("Connection strength 0-1 (default 0.5). Use 0.3-0.5 for weak signals, 0.5-0.7 for moderate, 0.7-1.0 for strong."),
    context: z.string().max(500).optional().describe("Brief context for the connection"),
    from_genres: z.string().max(200).optional().describe("Genres of the from_artist (stored if artist is new)"),
    to_genres: z.string().max(200).optional().describe("Genres of the to_artist (stored if artist is new)"),
    source_type: z.string().max(50).optional().describe("Source type: review, lastfm, musicbrainz, genius, wikipedia, web_search"),
    source_url: z.string().max(500).optional().describe("URL of the source"),
    source_name: z.string().max(200).optional().describe("Name of the source (e.g. 'Pitchfork', 'Last.fm')"),
    snippet: z.string().max(500).optional().describe("Relevant text snippet from the source"),
  },
  cacheInfluenceHandler,
);

const cacheBatchInfluences = tool(
  "cache_batch_influences",
  "Save multiple influence edges in one transaction. Use after extracting co-mentions from a review or processing Last.fm similar artists.",
  {
    edges: z.array(
      z.object({
        from_artist: z.string().max(200),
        to_artist: z.string().max(200),
        relationship: z.enum(["influenced", "co_mention", "collaboration", "sample", "similar", "bridge"]).optional(),
        weight: z.number().min(0).max(1).optional(),
        context: z.string().max(500).optional(),
        source_type: z.string().max(50).optional(),
        source_url: z.string().max(500).optional(),
        source_name: z.string().max(200).optional(),
        snippet: z.string().max(500).optional(),
      }),
    ).min(1).max(100).describe("Array of influence edges to cache"),
  },
  cacheBatchInfluencesHandler,
);

const lookupInfluences = tool(
  "lookup_influences",
  "Query cached influence connections for an artist. Check this BEFORE making web searches — if the artist has cached connections, use those first. Supports filtering by direction, relationship type, and minimum weight.",
  {
    artist: z.string().max(200).describe("Artist name to look up"),
    direction: z.enum(["outgoing", "incoming", "both"]).optional().describe("Edge direction (default: both). Outgoing = who this artist influenced. Incoming = who influenced this artist."),
    relationship: z.enum(["influenced", "co_mention", "collaboration", "sample", "similar", "bridge"]).optional().describe("Filter by relationship type"),
    min_weight: z.number().min(0).max(1).optional().describe("Minimum edge weight to include"),
    limit: z.number().min(1).max(200).optional().describe("Max results (default 50)"),
  },
  lookupInfluencesHandler,
);

const findCachedPath = tool(
  "find_cached_path",
  "Find a path between two artists in the cached influence graph using BFS. Much faster than trace_influence_path (no web searches). Returns the same PathStep[] format with a formatted visualization. Check this BEFORE using trace_influence_path.",
  {
    from_artist: z.string().max(200).describe("Starting artist"),
    to_artist: z.string().max(200).describe("Target artist"),
    max_depth: z.number().min(1).max(10).optional().describe("Maximum path length (default 5)"),
  },
  findCachedPathHandler,
);

const searchCachedArtists = tool(
  "search_cached_artists",
  "Search for artists in the influence cache by name. Returns artists with their connection counts.",
  {
    query: z.string().max(200).describe("Search term (case-insensitive LIKE match)"),
    limit: z.number().min(1).max(100).optional().describe("Max results (default 20)"),
  },
  searchCachedArtistsHandler,
);

const influenceGraphStats = tool(
  "influence_graph_stats",
  "Get statistics about the cached influence graph: total artists, edges, sources, breakdowns by relationship type, and most-connected artists.",
  {},
  influenceGraphStatsHandler,
);

const addArtistAlias = tool(
  "add_artist_alias",
  "Register an alternate name for an artist so lookups resolve correctly. E.g., alias 'DOOM' maps to 'MF DOOM', 'Ye' maps to 'Kanye West'.",
  {
    alias: z.string().max(200).describe("The alternate name to register"),
    artist_name: z.string().max(200).describe("The canonical artist name this alias maps to"),
  },
  addArtistAliasHandler,
);

const removeCachedEdge = tool(
  "remove_cached_edge",
  "Delete a bad or incorrect influence edge by ID. Use when a cached connection turns out to be wrong.",
  {
    edge_id: z.number().describe("Edge ID to remove (from lookup_influences results)"),
  },
  removeCachedEdgeHandler,
);

// ---------------------------------------------------------------------------
// Server export
// ---------------------------------------------------------------------------

export const influenceCacheServer = createSdkMcpServer({
  name: "influencecache",
  version: "1.0.0",
  tools: [
    cacheInfluence,
    cacheBatchInfluences,
    lookupInfluences,
    findCachedPath,
    searchCachedArtists,
    influenceGraphStats,
    addArtistAlias,
    removeCachedEdge,
  ],
});
