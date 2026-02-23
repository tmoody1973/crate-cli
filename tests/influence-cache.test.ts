// tests/influence-cache.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { _setDbDir, closeAll } from "../src/utils/db.js";
import {
  _resetSchema,
  cacheInfluenceHandler,
  cacheBatchInfluencesHandler,
  lookupInfluencesHandler,
  findCachedPathHandler,
  searchCachedArtistsHandler,
  influenceGraphStatsHandler,
  addArtistAliasHandler,
  removeCachedEdgeHandler,
} from "../src/servers/influence-cache.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseResult(result: any) {
  return JSON.parse(result.content[0].text);
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "influence-cache-test-"));
  _setDbDir(tmpDir);
  _resetSchema();
});

afterEach(() => {
  closeAll();
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

// ---------------------------------------------------------------------------
// cache_influence
// ---------------------------------------------------------------------------

describe("cache_influence", () => {
  it("saves a basic edge", async () => {
    const result = await cacheInfluenceHandler({
      from_artist: "Kraftwerk",
      to_artist: "Depeche Mode",
      relationship: "influenced",
      weight: 0.8,
      context: "Pioneered electronic pop",
    });
    const data = parseResult(result);
    expect(data.status).toBe("cached");
    expect(data.from).toBe("Kraftwerk");
    expect(data.to).toBe("Depeche Mode");
    expect(data.edge_id).toBeGreaterThan(0);
  });

  it("upserts — keeps MAX weight on conflict", async () => {
    await cacheInfluenceHandler({
      from_artist: "Kraftwerk",
      to_artist: "Depeche Mode",
      weight: 0.5,
    });
    // Second insert with higher weight
    await cacheInfluenceHandler({
      from_artist: "Kraftwerk",
      to_artist: "Depeche Mode",
      weight: 0.9,
    });
    // Third insert with lower weight — should NOT reduce
    await cacheInfluenceHandler({
      from_artist: "Kraftwerk",
      to_artist: "Depeche Mode",
      weight: 0.3,
    });

    const lookup = await lookupInfluencesHandler({ artist: "Kraftwerk", direction: "outgoing" });
    const data = parseResult(lookup);
    expect(data.connections).toHaveLength(1);
    expect(data.connections[0].weight).toBe(0.9);
  });

  it("appends source evidence", async () => {
    await cacheInfluenceHandler({
      from_artist: "Kraftwerk",
      to_artist: "Depeche Mode",
      source_type: "review",
      source_name: "Pitchfork",
      snippet: "Kraftwerk's influence on synth-pop",
    });
    await cacheInfluenceHandler({
      from_artist: "Kraftwerk",
      to_artist: "Depeche Mode",
      source_type: "wikipedia",
      source_name: "Wikipedia",
      snippet: "Influenced by Kraftwerk",
    });

    const stats = await influenceGraphStatsHandler();
    const data = parseResult(stats);
    expect(data.total_sources).toBe(2);
  });

  it("stores genres on new artists", async () => {
    await cacheInfluenceHandler({
      from_artist: "Kraftwerk",
      to_artist: "Depeche Mode",
      from_genres: "electronic, krautrock",
      to_genres: "synth-pop, new wave",
    });

    const search = await searchCachedArtistsHandler({ query: "Kraftwerk" });
    const data = parseResult(search);
    expect(data.artists[0].genres).toBe("electronic, krautrock");
  });

  it("uses default weight and relationship", async () => {
    const result = await cacheInfluenceHandler({
      from_artist: "A",
      to_artist: "B",
    });
    const data = parseResult(result);
    expect(data.relationship).toBe("influenced");
    expect(data.weight).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// cache_batch_influences
// ---------------------------------------------------------------------------

describe("cache_batch_influences", () => {
  it("saves multiple edges in one transaction", async () => {
    const result = await cacheBatchInfluencesHandler({
      edges: [
        { from_artist: "Kraftwerk", to_artist: "Depeche Mode", weight: 0.8 },
        { from_artist: "Kraftwerk", to_artist: "New Order", weight: 0.7 },
        { from_artist: "Kraftwerk", to_artist: "Aphex Twin", weight: 0.6 },
      ],
    });
    const data = parseResult(result);
    expect(data.status).toBe("cached");
    expect(data.count).toBe(3);
    expect(data.edges).toHaveLength(3);
  });

  it("handles upserts within batch", async () => {
    // Pre-cache an edge
    await cacheInfluenceHandler({
      from_artist: "Kraftwerk",
      to_artist: "Depeche Mode",
      weight: 0.5,
    });

    // Batch with a conflicting edge (higher weight)
    await cacheBatchInfluencesHandler({
      edges: [
        { from_artist: "Kraftwerk", to_artist: "Depeche Mode", weight: 0.9 },
        { from_artist: "Kraftwerk", to_artist: "New Order", weight: 0.7 },
      ],
    });

    const lookup = await lookupInfluencesHandler({ artist: "Kraftwerk", direction: "outgoing" });
    const data = parseResult(lookup);
    expect(data.connections).toHaveLength(2);

    const dm = data.connections.find((c: any) => c.to === "Depeche Mode");
    expect(dm.weight).toBe(0.9);
  });

  it("attaches source evidence to batch edges", async () => {
    await cacheBatchInfluencesHandler({
      edges: [
        {
          from_artist: "A",
          to_artist: "B",
          source_type: "review",
          source_name: "Pitchfork",
        },
        {
          from_artist: "C",
          to_artist: "D",
          source_type: "lastfm",
          source_name: "Last.fm",
        },
      ],
    });

    const stats = await influenceGraphStatsHandler();
    const data = parseResult(stats);
    expect(data.total_sources).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// lookup_influences
// ---------------------------------------------------------------------------

describe("lookup_influences", () => {
  beforeEach(async () => {
    await cacheBatchInfluencesHandler({
      edges: [
        { from_artist: "Kraftwerk", to_artist: "Depeche Mode", relationship: "influenced", weight: 0.8 },
        { from_artist: "Kraftwerk", to_artist: "New Order", relationship: "influenced", weight: 0.7 },
        { from_artist: "Brian Eno", to_artist: "Kraftwerk", relationship: "co_mention", weight: 0.5 },
        { from_artist: "Kraftwerk", to_artist: "Aphex Twin", relationship: "similar", weight: 0.4 },
      ],
    });
  });

  it("returns all connections for 'both' direction", async () => {
    const result = await lookupInfluencesHandler({ artist: "Kraftwerk" });
    const data = parseResult(result);
    expect(data.connections.length).toBe(4);
  });

  it("filters outgoing connections", async () => {
    const result = await lookupInfluencesHandler({ artist: "Kraftwerk", direction: "outgoing" });
    const data = parseResult(result);
    expect(data.connections.every((c: any) => c.direction === "outgoing")).toBe(true);
    expect(data.connections.length).toBe(3);
  });

  it("filters incoming connections", async () => {
    const result = await lookupInfluencesHandler({ artist: "Kraftwerk", direction: "incoming" });
    const data = parseResult(result);
    expect(data.connections.every((c: any) => c.direction === "incoming")).toBe(true);
    expect(data.connections.length).toBe(1);
  });

  it("filters by relationship type", async () => {
    const result = await lookupInfluencesHandler({ artist: "Kraftwerk", relationship: "influenced" });
    const data = parseResult(result);
    expect(data.connections.every((c: any) => c.relationship === "influenced")).toBe(true);
  });

  it("filters by minimum weight", async () => {
    const result = await lookupInfluencesHandler({ artist: "Kraftwerk", min_weight: 0.6 });
    const data = parseResult(result);
    expect(data.connections.every((c: any) => c.weight >= 0.6)).toBe(true);
  });

  it("returns empty for unknown artist", async () => {
    const result = await lookupInfluencesHandler({ artist: "Unknown Artist 12345" });
    const data = parseResult(result);
    expect(data.connections).toHaveLength(0);
    expect(data.message).toContain("not found");
  });

  it("resolves artist aliases", async () => {
    await addArtistAliasHandler({ alias: "KW", artist_name: "Kraftwerk" });
    const result = await lookupInfluencesHandler({ artist: "KW" });
    const data = parseResult(result);
    expect(data.connections.length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// find_cached_path
// ---------------------------------------------------------------------------

describe("find_cached_path", () => {
  beforeEach(async () => {
    // Build a chain: Kraftwerk → Depeche Mode → Radiohead → Bjork
    await cacheBatchInfluencesHandler({
      edges: [
        { from_artist: "Kraftwerk", to_artist: "Depeche Mode", weight: 0.8, context: "electronic pioneers" },
        { from_artist: "Depeche Mode", to_artist: "Radiohead", weight: 0.6, context: "electronic rock" },
        { from_artist: "Radiohead", to_artist: "Bjork", weight: 0.7, context: "experimental music" },
      ],
    });
  });

  it("finds a direct (depth 1) path", async () => {
    const result = await findCachedPathHandler({
      from_artist: "Kraftwerk",
      to_artist: "Depeche Mode",
    });
    const data = parseResult(result);
    expect(data.depth).toBe(1);
    expect(data.path).toHaveLength(2);
    expect(data.path[0].artist).toBe("Kraftwerk");
    expect(data.path[1].artist).toBe("Depeche Mode");
  });

  it("finds a multi-hop path", async () => {
    const result = await findCachedPathHandler({
      from_artist: "Kraftwerk",
      to_artist: "Bjork",
    });
    const data = parseResult(result);
    expect(data.depth).toBe(3);
    expect(data.path).toHaveLength(4);
    expect(data.path.map((s: any) => s.artist)).toEqual([
      "Kraftwerk",
      "Depeche Mode",
      "Radiohead",
      "Bjork",
    ]);
  });

  it("includes formatted path visualization", async () => {
    const result = await findCachedPathHandler({
      from_artist: "Kraftwerk",
      to_artist: "Depeche Mode",
    });
    const data = parseResult(result);
    expect(data.formatted_path).toBeTruthy();
    expect(data.inline_path).toBeTruthy();
  });

  it("returns empty path for disconnected artists", async () => {
    await cacheInfluenceHandler({ from_artist: "Miles Davis", to_artist: "John Coltrane" });
    const result = await findCachedPathHandler({
      from_artist: "Kraftwerk",
      to_artist: "Miles Davis",
    });
    const data = parseResult(result);
    expect(data.path).toHaveLength(0);
    expect(data.message).toContain("No cached path");
  });

  it("returns error for unknown from_artist", async () => {
    const result = await findCachedPathHandler({
      from_artist: "Nobody",
      to_artist: "Depeche Mode",
    });
    const data = parseResult(result);
    expect(data.path).toHaveLength(0);
    expect(data.message).toContain("not found");
  });

  it("respects max_depth limit", async () => {
    const result = await findCachedPathHandler({
      from_artist: "Kraftwerk",
      to_artist: "Bjork",
      max_depth: 2,
    });
    const data = parseResult(result);
    // Path is 3 hops, but max_depth is 2, so no path found
    expect(data.path).toHaveLength(0);
  });

  it("includes edge evidence in path steps", async () => {
    const result = await findCachedPathHandler({
      from_artist: "Kraftwerk",
      to_artist: "Depeche Mode",
    });
    const data = parseResult(result);
    expect(data.path[0].connection).toBeTruthy();
    expect(data.path[0].evidence).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// search_cached_artists
// ---------------------------------------------------------------------------

describe("search_cached_artists", () => {
  beforeEach(async () => {
    await cacheBatchInfluencesHandler({
      edges: [
        { from_artist: "Aphex Twin", to_artist: "Boards of Canada" },
        { from_artist: "Aphex Twin", to_artist: "Autechre" },
        { from_artist: "Aphex Twin", to_artist: "Squarepusher" },
      ],
    });
  });

  it("finds artists by partial name match", async () => {
    const result = await searchCachedArtistsHandler({ query: "aphex" });
    const data = parseResult(result);
    expect(data.artists.length).toBeGreaterThan(0);
    expect(data.artists[0].name).toBe("Aphex Twin");
  });

  it("returns connection counts", async () => {
    const result = await searchCachedArtistsHandler({ query: "Aphex" });
    const data = parseResult(result);
    const aphex = data.artists.find((a: any) => a.name === "Aphex Twin");
    expect(aphex.connections.outgoing).toBe(3);
    expect(aphex.connections.total).toBeGreaterThanOrEqual(3);
  });

  it("returns empty for no matches", async () => {
    const result = await searchCachedArtistsHandler({ query: "zzzznotfound" });
    const data = parseResult(result);
    expect(data.artists).toHaveLength(0);
  });

  it("respects limit", async () => {
    const result = await searchCachedArtistsHandler({ query: "a", limit: 2 });
    const data = parseResult(result);
    expect(data.artists.length).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// influence_graph_stats
// ---------------------------------------------------------------------------

describe("influence_graph_stats", () => {
  it("returns zeros for empty graph", async () => {
    const result = await influenceGraphStatsHandler();
    const data = parseResult(result);
    expect(data.total_artists).toBe(0);
    expect(data.total_edges).toBe(0);
    expect(data.total_sources).toBe(0);
  });

  it("returns correct totals", async () => {
    await cacheBatchInfluencesHandler({
      edges: [
        { from_artist: "A", to_artist: "B", relationship: "influenced", source_type: "review" },
        { from_artist: "B", to_artist: "C", relationship: "co_mention", source_type: "lastfm" },
        { from_artist: "A", to_artist: "C", relationship: "influenced" },
      ],
    });

    const result = await influenceGraphStatsHandler();
    const data = parseResult(result);
    expect(data.total_artists).toBe(3);
    expect(data.total_edges).toBe(3);
    expect(data.total_sources).toBe(2);
  });

  it("breaks down by relationship type", async () => {
    await cacheBatchInfluencesHandler({
      edges: [
        { from_artist: "A", to_artist: "B", relationship: "influenced" },
        { from_artist: "A", to_artist: "C", relationship: "influenced" },
        { from_artist: "A", to_artist: "D", relationship: "co_mention" },
      ],
    });

    const result = await influenceGraphStatsHandler();
    const data = parseResult(result);
    const influenced = data.by_relationship.find((r: any) => r.relationship === "influenced");
    expect(influenced.count).toBe(2);
  });

  it("lists most connected artists", async () => {
    await cacheBatchInfluencesHandler({
      edges: [
        { from_artist: "Hub", to_artist: "A" },
        { from_artist: "Hub", to_artist: "B" },
        { from_artist: "Hub", to_artist: "C" },
        { from_artist: "D", to_artist: "Hub" },
      ],
    });

    const result = await influenceGraphStatsHandler();
    const data = parseResult(result);
    expect(data.most_connected[0].name).toBe("Hub");
    expect(data.most_connected[0].total).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// add_artist_alias
// ---------------------------------------------------------------------------

describe("add_artist_alias", () => {
  it("registers an alias", async () => {
    await cacheInfluenceHandler({ from_artist: "MF DOOM", to_artist: "Madlib" });
    const result = await addArtistAliasHandler({ alias: "DOOM", artist_name: "MF DOOM" });
    const data = parseResult(result);
    expect(data.status).toBe("added");
    expect(data.alias).toBe("DOOM");
  });

  it("resolves lookup via alias", async () => {
    await cacheInfluenceHandler({ from_artist: "MF DOOM", to_artist: "Madlib", weight: 0.9 });
    await addArtistAliasHandler({ alias: "DOOM", artist_name: "MF DOOM" });

    const result = await lookupInfluencesHandler({ artist: "DOOM" });
    const data = parseResult(result);
    expect(data.connections.length).toBeGreaterThan(0);
  });

  it("reports already_exists for duplicate alias", async () => {
    await cacheInfluenceHandler({ from_artist: "MF DOOM", to_artist: "Madlib" });
    await addArtistAliasHandler({ alias: "DOOM", artist_name: "MF DOOM" });
    const result = await addArtistAliasHandler({ alias: "DOOM", artist_name: "MF DOOM" });
    const data = parseResult(result);
    expect(data.status).toBe("already_exists");
  });

  it("errors when alias maps to different artist", async () => {
    await cacheInfluenceHandler({ from_artist: "MF DOOM", to_artist: "Madlib" });
    await cacheInfluenceHandler({ from_artist: "Other DOOM", to_artist: "Someone" });
    await addArtistAliasHandler({ alias: "DOOM", artist_name: "MF DOOM" });

    const result = await addArtistAliasHandler({ alias: "DOOM", artist_name: "Other DOOM" });
    const data = parseResult(result);
    expect(data.error).toContain("different artist");
  });

  it("creates artist if not found", async () => {
    const result = await addArtistAliasHandler({ alias: "Ye", artist_name: "Kanye West" });
    const data = parseResult(result);
    expect(data.status).toBe("added");
    expect(data.artist_id).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// remove_cached_edge
// ---------------------------------------------------------------------------

describe("remove_cached_edge", () => {
  it("removes an edge by ID", async () => {
    const cached = await cacheInfluenceHandler({
      from_artist: "A",
      to_artist: "B",
      source_type: "review",
      source_name: "Pitchfork",
    });
    const edgeId = parseResult(cached).edge_id;

    const result = await removeCachedEdgeHandler({ edge_id: edgeId });
    const data = parseResult(result);
    expect(data.status).toBe("removed");
    expect(data.edge_id).toBe(edgeId);

    // Verify it's gone
    const lookup = await lookupInfluencesHandler({ artist: "A" });
    const lookupData = parseResult(lookup);
    expect(lookupData.connections).toHaveLength(0);
  });

  it("also removes associated sources", async () => {
    const cached = await cacheInfluenceHandler({
      from_artist: "A",
      to_artist: "B",
      source_type: "review",
      source_name: "Pitchfork",
    });
    const edgeId = parseResult(cached).edge_id;

    await removeCachedEdgeHandler({ edge_id: edgeId });

    const stats = await influenceGraphStatsHandler();
    const data = parseResult(stats);
    expect(data.total_sources).toBe(0);
  });

  it("errors for non-existent edge", async () => {
    const result = await removeCachedEdgeHandler({ edge_id: 9999 });
    const data = parseResult(result);
    expect(data.error).toContain("not found");
  });
});

// ---------------------------------------------------------------------------
// Artist resolution edge cases
// ---------------------------------------------------------------------------

describe("artist resolution", () => {
  it("is case-insensitive", async () => {
    await cacheInfluenceHandler({ from_artist: "Aphex Twin", to_artist: "Boards of Canada" });
    await cacheInfluenceHandler({ from_artist: "aphex twin", to_artist: "Autechre" });

    const result = await lookupInfluencesHandler({ artist: "APHEX TWIN", direction: "outgoing" });
    const data = parseResult(result);
    // Both edges should link to the same artist
    expect(data.connections.length).toBe(2);
  });

  it("does not create duplicate artists for case variations", async () => {
    await cacheInfluenceHandler({ from_artist: "Radiohead", to_artist: "A" });
    await cacheInfluenceHandler({ from_artist: "radiohead", to_artist: "B" });

    const stats = await influenceGraphStatsHandler();
    const data = parseResult(stats);
    // Radiohead + A + B = 3 artists, not 4
    expect(data.total_artists).toBe(3);
  });
});
