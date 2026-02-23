import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const BASE_URL = "https://api.discogs.com";
const USER_AGENT = "CrateCLI/1.0 +https://github.com/user/crate-cli";
const RATE_LIMIT_MS = 1000;
const FETCH_TIMEOUT_MS = 15_000;

let lastRequest = 0;

export async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequest;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
  lastRequest = Date.now();
}

export async function discogsFetch(
  path: string,
  params?: Record<string, string>,
): Promise<any> {
  await rateLimit();

  const key = process.env.DISCOGS_KEY;
  const secret = process.env.DISCOGS_SECRET;
  if (!key || !secret) {
    throw new Error("DISCOGS_KEY and DISCOGS_SECRET are required");
  }

  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: {
        "User-Agent": USER_AGENT,
        Authorization: `Discogs key=${key}, secret=${secret}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`Discogs API error: ${res.status}`);
  }
  return res.json();
}

type ToolResult = { content: [{ type: "text"; text: string }] };

function toolResult(data: unknown): ToolResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }] };
}

// --- Handler functions (exported for testing) ---

export async function searchDiscogsHandler(args: {
  query: string;
  type?: string;
  genre?: string;
  style?: string;
  country?: string;
  year?: string;
  per_page?: number;
}) {
  try {
    const params: Record<string, string> = {
      q: args.query,
      per_page: String(args.per_page ?? 10),
    };
    if (args.type) params.type = args.type;
    if (args.genre) params.genre = args.genre;
    if (args.style) params.style = args.style;
    if (args.country) params.country = args.country;
    if (args.year) params.year = args.year;

    const data = await discogsFetch("/database/search", params);
    const results = (data.results ?? []).map((r: any) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      year: r.year,
      country: r.country,
      label: r.label,
      format: r.format,
      thumb: r.thumb,
    }));
    return toolResult({ results, pagination: data.pagination });
  } catch (error) {
    return toolError(error);
  }
}

export async function getArtistDiscogsHandler(args: { artist_id: number }) {
  try {
    const data = await discogsFetch(`/artists/${args.artist_id}`);
    return toolResult({
      id: data.id,
      name: data.name,
      realname: data.realname,
      profile: data.profile?.slice(0, 2000),
      urls: data.urls,
      members: data.members?.map((m: any) => ({ id: m.id, name: m.name })),
      aliases: data.aliases?.map((a: any) => ({ id: a.id, name: a.name })),
      images: data.images?.slice(0, 3),
    });
  } catch (error) {
    return toolError(error);
  }
}

export async function getArtistReleasesHandler(args: {
  artist_id: number;
  sort?: string;
  sort_order?: string;
  per_page?: number;
  page?: number;
}) {
  try {
    const params: Record<string, string> = {
      sort: args.sort ?? "year",
      sort_order: args.sort_order ?? "asc",
      per_page: String(args.per_page ?? 25),
    };
    if (args.page) params.page = String(args.page);

    const data = await discogsFetch(`/artists/${args.artist_id}/releases`, params);
    const releases = (data.releases ?? []).map((r: any) => ({
      id: r.id,
      title: r.title,
      year: r.year,
      type: r.type,
      role: r.role,
      format: r.format,
      label: r.label,
      thumb: r.thumb,
    }));
    return toolResult({ releases, pagination: data.pagination });
  } catch (error) {
    return toolError(error);
  }
}

export async function getLabelHandler(args: { label_id: number }) {
  try {
    const data = await discogsFetch(`/labels/${args.label_id}`);
    return toolResult({
      id: data.id,
      name: data.name,
      profile: data.profile?.slice(0, 2000),
      contact_info: data.contact_info,
      urls: data.urls,
      sublabels: data.sublabels?.map((s: any) => ({ id: s.id, name: s.name })),
      parent_label: data.parent_label,
    });
  } catch (error) {
    return toolError(error);
  }
}

export async function getLabelReleasesHandler(args: {
  label_id: number;
  per_page?: number;
  page?: number;
}) {
  try {
    const params: Record<string, string> = {
      per_page: String(args.per_page ?? 25),
    };
    if (args.page) params.page = String(args.page);

    const data = await discogsFetch(`/labels/${args.label_id}/releases`, params);
    const releases = (data.releases ?? []).map((r: any) => ({
      id: r.id,
      title: r.title,
      year: r.year,
      artist: r.artist,
      format: r.format,
      catno: r.catno,
      thumb: r.thumb,
    }));
    return toolResult({ releases, pagination: data.pagination });
  } catch (error) {
    return toolError(error);
  }
}

export async function getMasterHandler(args: { master_id: number }) {
  try {
    const data = await discogsFetch(`/masters/${args.master_id}`);
    return toolResult({
      id: data.id,
      title: data.title,
      year: data.year,
      artists: data.artists,
      genres: data.genres,
      styles: data.styles,
      tracklist: data.tracklist?.map((t: any) => ({
        position: t.position,
        title: t.title,
        duration: t.duration,
      })),
      main_release: data.main_release,
      most_recent_release: data.most_recent_release,
    });
  } catch (error) {
    return toolError(error);
  }
}

export async function getMasterVersionsHandler(args: {
  master_id: number;
  per_page?: number;
  page?: number;
}) {
  try {
    const params: Record<string, string> = {
      per_page: String(args.per_page ?? 25),
    };
    if (args.page) params.page = String(args.page);

    const data = await discogsFetch(`/masters/${args.master_id}/versions`, params);
    const versions = (data.versions ?? []).map((v: any) => ({
      id: v.id,
      title: v.title,
      year: v.year,
      country: v.country,
      format: v.format,
      label: v.label,
      catno: v.catno,
      thumb: v.thumb,
    }));
    return toolResult({ versions, pagination: data.pagination });
  } catch (error) {
    return toolError(error);
  }
}

export async function getReleaseFullHandler(args: { release_id: number }) {
  try {
    const data = await discogsFetch(`/releases/${args.release_id}`);
    return toolResult({
      id: data.id,
      title: data.title,
      year: data.year,
      artists: data.artists,
      labels: data.labels,
      formats: data.formats,
      genres: data.genres,
      styles: data.styles,
      tracklist: data.tracklist?.map((t: any) => ({
        position: t.position,
        title: t.title,
        duration: t.duration,
        extraartists: t.extraartists,
      })),
      notes: data.notes?.slice(0, 2000),
      identifiers: data.identifiers,
      companies: data.companies,
    });
  } catch (error) {
    return toolError(error);
  }
}

export async function getMarketplaceStatsHandler(args: { release_id: number }) {
  try {
    const data = await discogsFetch(`/marketplace/stats/${args.release_id}`);
    return toolResult(data);
  } catch (error) {
    return toolError(error);
  }
}

// --- Tool definitions ---

const searchDiscogs = tool(
  "search_discogs",
  "Search the Discogs database for artists, releases, masters, or labels. Returns matching results with IDs, types, and thumbnails.",
  {
    query: z.string().max(200).describe("Search query"),
    type: z.enum(["artist", "release", "master", "label"]).optional().describe("Filter by type"),
    genre: z.string().max(100).optional().describe("Filter by genre"),
    style: z.string().max(100).optional().describe("Filter by style"),
    country: z.string().max(100).optional().describe("Filter by country"),
    year: z.string().max(10).optional().describe("Filter by year"),
    per_page: z.number().optional().describe("Results per page (default 10)"),
  },
  searchDiscogsHandler,
);

const getArtistDiscogs = tool(
  "get_artist_discogs",
  "Get full artist profile from Discogs by ID. Includes bio, URLs, group members, aliases, and images.",
  { artist_id: z.number().describe("Discogs artist ID") },
  getArtistDiscogsHandler,
);

const getArtistReleases = tool(
  "get_artist_releases",
  "Get an artist's discography from Discogs. Lists releases with year, format, label, and role (main, remix, appearance, etc.).",
  {
    artist_id: z.number().describe("Discogs artist ID"),
    sort: z.enum(["year", "title", "format"]).optional().describe("Sort field (default: year)"),
    sort_order: z.enum(["asc", "desc"]).optional().describe("Sort direction (default: asc)"),
    per_page: z.number().optional().describe("Results per page (default 25)"),
    page: z.number().optional().describe("Page number"),
  },
  getArtistReleasesHandler,
);

const getLabel = tool(
  "get_label",
  "Get label profile from Discogs by ID. Includes bio, contact info, URLs, sublabels, and parent label.",
  { label_id: z.number().describe("Discogs label ID") },
  getLabelHandler,
);

const getLabelReleases = tool(
  "get_label_releases",
  "Get a label's catalog from Discogs. Lists releases with artist, year, format, and catalog number.",
  {
    label_id: z.number().describe("Discogs label ID"),
    per_page: z.number().optional().describe("Results per page (default 25)"),
    page: z.number().optional().describe("Page number"),
  },
  getLabelReleasesHandler,
);

const getMaster = tool(
  "get_master",
  "Get a master release from Discogs by ID. A master groups all versions (pressings, formats) of a release. Includes tracklist, genres, styles.",
  { master_id: z.number().describe("Discogs master release ID") },
  getMasterHandler,
);

const getMasterVersions = tool(
  "get_master_versions",
  "Get all versions (pressings, formats, countries) of a master release from Discogs.",
  {
    master_id: z.number().describe("Discogs master release ID"),
    per_page: z.number().optional().describe("Results per page (default 25)"),
    page: z.number().optional().describe("Page number"),
  },
  getMasterVersionsHandler,
);

const getReleaseFull = tool(
  "get_release_full",
  "Get full release details from Discogs by ID. Includes tracklist with per-track credits, formats, identifiers (barcodes, matrix numbers), pressing companies, and notes.",
  { release_id: z.number().describe("Discogs release ID") },
  getReleaseFullHandler,
);

const getMarketplaceStats = tool(
  "get_marketplace_stats",
  "Get marketplace pricing stats for a Discogs release. Shows lowest price, number for sale, and whether blocked from sale.",
  { release_id: z.number().describe("Discogs release ID") },
  getMarketplaceStatsHandler,
);

// --- Server export ---

export const discogsServer = createSdkMcpServer({
  name: "discogs",
  version: "1.0.0",
  tools: [
    searchDiscogs,
    getArtistDiscogs,
    getArtistReleases,
    getLabel,
    getLabelReleases,
    getMaster,
    getMasterVersions,
    getReleaseFull,
    getMarketplaceStats,
  ],
});
