# Discogs MCP Server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Discogs MCP server with 9 tools for vinyl/physical release data, credits, labels, and marketplace pricing.

**Architecture:** Single-file MCP server (`src/servers/discogs.ts`) mirroring the MusicBrainz pattern — rate limiter, auth'd fetch wrapper, exported handlers, Zod-validated tool definitions. Key-gated on `DISCOGS_KEY` + `DISCOGS_SECRET` env vars.

**Tech Stack:** TypeScript, Claude Agent SDK (`tool()`, `createSdkMcpServer()`), Zod, Vitest

**Design doc:** `docs/plans/2026-02-20-discogs-server-design.md`

---

### Task 1: Update config for Discogs key-gating

**Files:**
- Modify: `src/utils/config.ts:7`
- Modify: `tests/config.test.ts`

**Step 1: Write the failing test**

In `tests/config.test.ts`, add a test that checks both `DISCOGS_KEY` and `DISCOGS_SECRET` are required:

```typescript
it("detects Discogs keys when both are present", async () => {
  process.env.DISCOGS_KEY = "test-key";
  process.env.DISCOGS_SECRET = "test-secret";
  const { getConfig } = await import("../src/utils/config.js");
  const config = getConfig();
  expect(config.availableKeys).toContain("DISCOGS_KEY");
  expect(config.availableKeys).toContain("DISCOGS_SECRET");
});
```

Also update the existing test on line 22 — change `DISCOGS_TOKEN` to `DISCOGS_KEY`:

```typescript
it("detects available API keys", async () => {
  process.env.DISCOGS_KEY = "test-key";
  const { getConfig } = await import("../src/utils/config.js");
  const config = getConfig();
  expect(config.availableKeys).toContain("DISCOGS_KEY");
});
```

And update the existing test on line 28 — change `DISCOGS_TOKEN` to `DISCOGS_KEY`:

```typescript
it("does not list missing keys as available", async () => {
  delete process.env.DISCOGS_KEY;
  const { getConfig } = await import("../src/utils/config.js");
  const config = getConfig();
  expect(config.availableKeys).not.toContain("DISCOGS_KEY");
});
```

**Step 2: Run tests to verify failure**

Run: `npx vitest run tests/config.test.ts`
Expected: The new test fails (DISCOGS_KEY not detected because config still uses DISCOGS_TOKEN). Existing tests may also fail since they reference the old env var.

**Step 3: Update config**

In `src/utils/config.ts`, change line 7 from:
```typescript
  discogs: ["DISCOGS_TOKEN"],
```
to:
```typescript
  discogs: ["DISCOGS_KEY", "DISCOGS_SECRET"],
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/config.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/utils/config.ts tests/config.test.ts
git commit -m "feat: update Discogs config to use key/secret auth"
```

---

### Task 2: Create Discogs server — helpers and first tool (search_discogs)

**Files:**
- Create: `src/servers/discogs.ts`
- Create: `tests/discogs.test.ts`

**Step 1: Write the failing test**

Create `tests/discogs.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// We'll mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("searchDiscogsHandler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.DISCOGS_KEY = "test-key";
    process.env.DISCOGS_SECRET = "test-secret";
  });

  it("searches Discogs and returns shaped results", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 123,
            type: "release",
            title: "Kind of Blue",
            year: "1959",
            country: "US",
            label: ["Columbia"],
            format: ["Vinyl"],
            thumb: "https://example.com/thumb.jpg",
            resource_url: "https://api.discogs.com/releases/123",
          },
        ],
        pagination: { pages: 1, items: 1 },
      }),
    });

    const { searchDiscogsHandler } = await import("../src/servers/discogs.js");
    const result = await searchDiscogsHandler({ query: "Kind of Blue" });

    expect(result.content[0].type).toBe("text");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].id).toBe(123);
    expect(parsed.results[0].title).toBe("Kind of Blue");
    expect(parsed.pagination).toBeDefined();
  });

  it("passes type filter to search", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [], pagination: { pages: 0, items: 0 } }),
    });

    const { searchDiscogsHandler } = await import("../src/servers/discogs.js");
    await searchDiscogsHandler({ query: "Miles Davis", type: "artist" });

    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("type=artist");
  });

  it("returns error on API failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const { searchDiscogsHandler } = await import("../src/servers/discogs.js");
    const result = await searchDiscogsHandler({ query: "nonexistent" });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/discogs.test.ts`
Expected: FAIL — module `../src/servers/discogs.js` not found

**Step 3: Create `src/servers/discogs.ts` with helpers + search tool**

```typescript
import { z } from "zod";
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";

const BASE_URL = "https://api.discogs.com";
const USER_AGENT = "CrateCLI/1.0 +https://github.com/user/crate-cli";
const RATE_LIMIT_MS = 1000;

let lastRequest = 0;

export async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequest;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
  lastRequest = Date.now();
}

async function discogsFetch(
  path: string,
  params?: Record<string, string>,
): Promise<any> {
  await rateLimit();
  const key = process.env.DISCOGS_KEY;
  const secret = process.env.DISCOGS_SECRET;
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": USER_AGENT,
      Authorization: `Discogs key=${key}, secret=${secret}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Discogs API error: ${res.status}`);
  return res.json();
}

function toolResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function toolError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [
      { type: "text" as const, text: JSON.stringify({ error: message }) },
    ],
  };
}

// --- Tool 1: search_discogs ---

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

const searchDiscogs = tool(
  "search_discogs",
  "Search the Discogs database for artists, releases, masters, and labels. Supports filtering by type, genre, style, country, and year.",
  {
    query: z.string().describe("Search query"),
    type: z
      .enum(["artist", "release", "master", "label"])
      .optional()
      .describe("Filter by result type"),
    genre: z.string().optional().describe("Filter by genre"),
    style: z.string().optional().describe("Filter by style"),
    country: z.string().optional().describe("Filter by country"),
    year: z.string().optional().describe("Filter by year"),
    per_page: z
      .number()
      .optional()
      .describe("Results per page (default 10, max 100)"),
  },
  searchDiscogsHandler,
);

export const discogsServer = createSdkMcpServer({
  name: "discogs",
  version: "1.0.0",
  tools: [searchDiscogs],
});
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/discogs.test.ts`
Expected: All 3 tests PASS

**Step 5: Commit**

```bash
git add src/servers/discogs.ts tests/discogs.test.ts
git commit -m "feat: add Discogs server with search tool"
```

---

### Task 3: Add artist tools (get_artist_discogs, get_artist_releases)

**Files:**
- Modify: `src/servers/discogs.ts`
- Modify: `tests/discogs.test.ts`

**Step 1: Write the failing tests**

Add to `tests/discogs.test.ts`:

```typescript
describe("getArtistDiscogsHandler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.DISCOGS_KEY = "test-key";
    process.env.DISCOGS_SECRET = "test-secret";
  });

  it("fetches artist profile and shapes response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 45,
        name: "Miles Davis",
        realname: "Miles Dewey Davis III",
        profile: "Jazz trumpet player " + "x".repeat(3000),
        urls: ["https://example.com"],
        members: [{ id: 1, name: "Member One", active: true }],
        aliases: [{ id: 2, name: "Alias One" }],
        images: [
          { uri: "img1.jpg" },
          { uri: "img2.jpg" },
          { uri: "img3.jpg" },
          { uri: "img4.jpg" },
        ],
      }),
    });

    const { getArtistDiscogsHandler } = await import(
      "../src/servers/discogs.js"
    );
    const result = await getArtistDiscogsHandler({ artist_id: 45 });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.id).toBe(45);
    expect(parsed.name).toBe("Miles Davis");
    expect(parsed.profile.length).toBeLessThanOrEqual(2000);
    expect(parsed.images).toHaveLength(3);
  });
});

describe("getArtistReleasesHandler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.DISCOGS_KEY = "test-key";
    process.env.DISCOGS_SECRET = "test-secret";
  });

  it("fetches artist releases with pagination", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        releases: [
          {
            id: 100,
            title: "Kind of Blue",
            year: 1959,
            type: "master",
            role: "Main",
            format: "Vinyl",
            label: "Columbia",
            thumb: "thumb.jpg",
          },
        ],
        pagination: { pages: 2, page: 1, items: 50 },
      }),
    });

    const { getArtistReleasesHandler } = await import(
      "../src/servers/discogs.js"
    );
    const result = await getArtistReleasesHandler({ artist_id: 45 });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.releases).toHaveLength(1);
    expect(parsed.releases[0].title).toBe("Kind of Blue");
    expect(parsed.pagination).toBeDefined();
  });
});
```

**Step 2: Run tests to verify failure**

Run: `npx vitest run tests/discogs.test.ts`
Expected: FAIL — `getArtistDiscogsHandler` and `getArtistReleasesHandler` not found

**Step 3: Add handler functions and tool definitions**

In `src/servers/discogs.ts`, add after the `searchDiscogsHandler`:

```typescript
// --- Tool 2: get_artist_discogs ---

export async function getArtistDiscogsHandler(args: { artist_id: number }) {
  try {
    const data = await discogsFetch(`/artists/${args.artist_id}`);
    return toolResult({
      id: data.id,
      name: data.name,
      realname: data.realname,
      profile: data.profile?.slice(0, 2000),
      urls: data.urls,
      members: (data.members ?? []).map((m: any) => ({
        id: m.id,
        name: m.name,
        active: m.active,
      })),
      aliases: (data.aliases ?? []).map((a: any) => ({
        id: a.id,
        name: a.name,
      })),
      images: (data.images ?? []).slice(0, 3).map((i: any) => i.uri),
    });
  } catch (error) {
    return toolError(error);
  }
}

const getArtistDiscogs = tool(
  "get_artist_discogs",
  "Get detailed artist profile from Discogs including bio, members, aliases, and images.",
  {
    artist_id: z.number().describe("Discogs artist ID"),
  },
  getArtistDiscogsHandler,
);

// --- Tool 3: get_artist_releases ---

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
      sort_order: args.sort_order ?? "desc",
      per_page: String(args.per_page ?? 25),
    };
    if (args.page) params.page = String(args.page);

    const data = await discogsFetch(
      `/artists/${args.artist_id}/releases`,
      params,
    );
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

const getArtistReleases = tool(
  "get_artist_releases",
  "Get an artist's discography from Discogs. Returns releases sorted by year with pagination.",
  {
    artist_id: z.number().describe("Discogs artist ID"),
    sort: z
      .enum(["year", "title", "format"])
      .optional()
      .describe("Sort field (default: year)"),
    sort_order: z
      .enum(["asc", "desc"])
      .optional()
      .describe("Sort order (default: desc)"),
    per_page: z
      .number()
      .optional()
      .describe("Results per page (default 25)"),
    page: z.number().optional().describe("Page number"),
  },
  getArtistReleasesHandler,
);
```

Update the `tools` array in the server export:

```typescript
export const discogsServer = createSdkMcpServer({
  name: "discogs",
  version: "1.0.0",
  tools: [searchDiscogs, getArtistDiscogs, getArtistReleases],
});
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/discogs.test.ts`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add src/servers/discogs.ts tests/discogs.test.ts
git commit -m "feat: add Discogs artist profile and releases tools"
```

---

### Task 4: Add label tools (get_label, get_label_releases)

**Files:**
- Modify: `src/servers/discogs.ts`
- Modify: `tests/discogs.test.ts`

**Step 1: Write the failing tests**

Add to `tests/discogs.test.ts`:

```typescript
describe("getLabelHandler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.DISCOGS_KEY = "test-key";
    process.env.DISCOGS_SECRET = "test-secret";
  });

  it("fetches label profile", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 10,
        name: "Blue Note",
        profile: "Jazz label " + "x".repeat(3000),
        contact_info: "info@bluenote.com",
        urls: ["https://bluenote.com"],
        sublabels: [{ id: 20, name: "Sub Label" }],
        parent_label: { id: 5, name: "Parent" },
      }),
    });

    const { getLabelHandler } = await import("../src/servers/discogs.js");
    const result = await getLabelHandler({ label_id: 10 });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.id).toBe(10);
    expect(parsed.name).toBe("Blue Note");
    expect(parsed.profile.length).toBeLessThanOrEqual(2000);
    expect(parsed.sublabels).toHaveLength(1);
  });
});

describe("getLabelReleasesHandler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.DISCOGS_KEY = "test-key";
    process.env.DISCOGS_SECRET = "test-secret";
  });

  it("fetches label releases", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        releases: [
          {
            id: 200,
            title: "Maiden Voyage",
            year: 1965,
            artist: "Herbie Hancock",
            format: "Vinyl",
            catno: "BLP 4195",
            thumb: "thumb.jpg",
          },
        ],
        pagination: { pages: 1, items: 1 },
      }),
    });

    const { getLabelReleasesHandler } = await import(
      "../src/servers/discogs.js"
    );
    const result = await getLabelReleasesHandler({ label_id: 10 });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.releases).toHaveLength(1);
    expect(parsed.releases[0].catno).toBe("BLP 4195");
  });
});
```

**Step 2: Run tests to verify failure**

Run: `npx vitest run tests/discogs.test.ts`
Expected: FAIL — handlers not found

**Step 3: Add label handlers and tools**

In `src/servers/discogs.ts`:

```typescript
// --- Tool 4: get_label ---

export async function getLabelHandler(args: { label_id: number }) {
  try {
    const data = await discogsFetch(`/labels/${args.label_id}`);
    return toolResult({
      id: data.id,
      name: data.name,
      profile: data.profile?.slice(0, 2000),
      contact_info: data.contact_info,
      urls: data.urls,
      sublabels: (data.sublabels ?? []).map((s: any) => ({
        id: s.id,
        name: s.name,
      })),
      parent_label: data.parent_label,
    });
  } catch (error) {
    return toolError(error);
  }
}

const getLabel = tool(
  "get_label",
  "Get label profile from Discogs including sublabels, parent label, and contact info.",
  {
    label_id: z.number().describe("Discogs label ID"),
  },
  getLabelHandler,
);

// --- Tool 5: get_label_releases ---

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

    const data = await discogsFetch(
      `/labels/${args.label_id}/releases`,
      params,
    );
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

const getLabelReleases = tool(
  "get_label_releases",
  "Get releases from a Discogs label. Returns catalog with artist, format, and catalog number.",
  {
    label_id: z.number().describe("Discogs label ID"),
    per_page: z.number().optional().describe("Results per page (default 25)"),
    page: z.number().optional().describe("Page number"),
  },
  getLabelReleasesHandler,
);
```

Update the `tools` array:

```typescript
tools: [searchDiscogs, getArtistDiscogs, getArtistReleases, getLabel, getLabelReleases],
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/discogs.test.ts`
Expected: All 7 tests PASS

**Step 5: Commit**

```bash
git add src/servers/discogs.ts tests/discogs.test.ts
git commit -m "feat: add Discogs label profile and releases tools"
```

---

### Task 5: Add master release tools (get_master, get_master_versions)

**Files:**
- Modify: `src/servers/discogs.ts`
- Modify: `tests/discogs.test.ts`

**Step 1: Write the failing tests**

Add to `tests/discogs.test.ts`:

```typescript
describe("getMasterHandler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.DISCOGS_KEY = "test-key";
    process.env.DISCOGS_SECRET = "test-secret";
  });

  it("fetches master release with tracklist", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 5000,
        title: "Kind of Blue",
        year: 1959,
        artists: [{ name: "Miles Davis", id: 45 }],
        genres: ["Jazz"],
        styles: ["Modal"],
        tracklist: [
          { position: "A1", title: "So What", duration: "9:22" },
          { position: "A2", title: "Freddie Freeloader", duration: "9:46" },
        ],
        images: [{ uri: "img.jpg" }],
        main_release: 1000,
        most_recent_release: 2000,
      }),
    });

    const { getMasterHandler } = await import("../src/servers/discogs.js");
    const result = await getMasterHandler({ master_id: 5000 });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.id).toBe(5000);
    expect(parsed.tracklist).toHaveLength(2);
    expect(parsed.tracklist[0].title).toBe("So What");
    expect(parsed.genres).toContain("Jazz");
  });
});

describe("getMasterVersionsHandler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.DISCOGS_KEY = "test-key";
    process.env.DISCOGS_SECRET = "test-secret";
  });

  it("fetches master versions", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        versions: [
          {
            id: 1001,
            title: "Kind of Blue",
            year: "1959",
            country: "US",
            format: "Vinyl, LP",
            label: "Columbia",
            catno: "CS 8163",
            thumb: "thumb.jpg",
          },
        ],
        pagination: { pages: 3, items: 75 },
      }),
    });

    const { getMasterVersionsHandler } = await import(
      "../src/servers/discogs.js"
    );
    const result = await getMasterVersionsHandler({ master_id: 5000 });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.versions).toHaveLength(1);
    expect(parsed.versions[0].catno).toBe("CS 8163");
  });
});
```

**Step 2: Run tests to verify failure**

Run: `npx vitest run tests/discogs.test.ts`
Expected: FAIL — handlers not found

**Step 3: Add master handlers and tools**

In `src/servers/discogs.ts`:

```typescript
// --- Tool 6: get_master ---

export async function getMasterHandler(args: { master_id: number }) {
  try {
    const data = await discogsFetch(`/masters/${args.master_id}`);
    return toolResult({
      id: data.id,
      title: data.title,
      year: data.year,
      artists: (data.artists ?? []).map((a: any) => ({
        id: a.id,
        name: a.name,
      })),
      genres: data.genres,
      styles: data.styles,
      tracklist: (data.tracklist ?? []).map((t: any) => ({
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

const getMaster = tool(
  "get_master",
  "Get a master release from Discogs — the canonical version of a release across all formats and pressings. Includes tracklist, genres, and styles.",
  {
    master_id: z.number().describe("Discogs master release ID"),
  },
  getMasterHandler,
);

// --- Tool 7: get_master_versions ---

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

    const data = await discogsFetch(
      `/masters/${args.master_id}/versions`,
      params,
    );
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

const getMasterVersions = tool(
  "get_master_versions",
  "Get all versions (pressings, formats, countries) of a Discogs master release.",
  {
    master_id: z.number().describe("Discogs master release ID"),
    per_page: z.number().optional().describe("Results per page (default 25)"),
    page: z.number().optional().describe("Page number"),
  },
  getMasterVersionsHandler,
);
```

Update the `tools` array:

```typescript
tools: [searchDiscogs, getArtistDiscogs, getArtistReleases, getLabel, getLabelReleases, getMaster, getMasterVersions],
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/discogs.test.ts`
Expected: All 9 tests PASS

**Step 5: Commit**

```bash
git add src/servers/discogs.ts tests/discogs.test.ts
git commit -m "feat: add Discogs master release and versions tools"
```

---

### Task 6: Add release and marketplace tools (get_release_full, get_marketplace_stats)

**Files:**
- Modify: `src/servers/discogs.ts`
- Modify: `tests/discogs.test.ts`

**Step 1: Write the failing tests**

Add to `tests/discogs.test.ts`:

```typescript
describe("getReleaseFullHandler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.DISCOGS_KEY = "test-key";
    process.env.DISCOGS_SECRET = "test-secret";
  });

  it("fetches full release with credits and formats", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 1000,
        title: "Kind of Blue",
        year: 1959,
        artists: [{ name: "Miles Davis", id: 45 }],
        labels: [{ id: 10, name: "Columbia", catno: "CS 8163" }],
        formats: [{ name: "Vinyl", qty: "1", descriptions: ["LP", "Stereo"] }],
        genres: ["Jazz"],
        styles: ["Modal"],
        tracklist: [
          {
            position: "A1",
            title: "So What",
            duration: "9:22",
            extraartists: [
              { name: "Bill Evans", role: "Piano" },
            ],
          },
        ],
        notes: "Original pressing " + "x".repeat(3000),
        identifiers: [{ type: "Barcode", value: "1234567890" }],
        companies: [{ name: "CBS", entity_type_name: "Manufactured By" }],
      }),
    });

    const { getReleaseFullHandler } = await import(
      "../src/servers/discogs.js"
    );
    const result = await getReleaseFullHandler({ release_id: 1000 });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.id).toBe(1000);
    expect(parsed.tracklist[0].extraartists).toHaveLength(1);
    expect(parsed.notes.length).toBeLessThanOrEqual(2000);
    expect(parsed.formats[0].descriptions).toContain("Stereo");
  });
});

describe("getMarketplaceStatsHandler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.DISCOGS_KEY = "test-key";
    process.env.DISCOGS_SECRET = "test-secret";
  });

  it("fetches marketplace stats", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        lowest_price: { value: 25.0, currency: "USD" },
        num_for_sale: 42,
        blocked_from_sale: false,
      }),
    });

    const { getMarketplaceStatsHandler } = await import(
      "../src/servers/discogs.js"
    );
    const result = await getMarketplaceStatsHandler({ release_id: 1000 });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.lowest_price.value).toBe(25.0);
    expect(parsed.num_for_sale).toBe(42);
    expect(parsed.blocked_from_sale).toBe(false);
  });
});
```

**Step 2: Run tests to verify failure**

Run: `npx vitest run tests/discogs.test.ts`
Expected: FAIL — handlers not found

**Step 3: Add release and marketplace handlers**

In `src/servers/discogs.ts`:

```typescript
// --- Tool 8: get_release_full ---

export async function getReleaseFullHandler(args: { release_id: number }) {
  try {
    const data = await discogsFetch(`/releases/${args.release_id}`);
    return toolResult({
      id: data.id,
      title: data.title,
      year: data.year,
      artists: (data.artists ?? []).map((a: any) => ({
        id: a.id,
        name: a.name,
      })),
      labels: (data.labels ?? []).map((l: any) => ({
        id: l.id,
        name: l.name,
        catno: l.catno,
      })),
      formats: data.formats,
      genres: data.genres,
      styles: data.styles,
      tracklist: (data.tracklist ?? []).map((t: any) => ({
        position: t.position,
        title: t.title,
        duration: t.duration,
        extraartists: (t.extraartists ?? []).map((e: any) => ({
          name: e.name,
          role: e.role,
        })),
      })),
      notes: data.notes?.slice(0, 2000),
      identifiers: data.identifiers,
      companies: (data.companies ?? []).map((c: any) => ({
        name: c.name,
        entity_type_name: c.entity_type_name,
      })),
    });
  } catch (error) {
    return toolError(error);
  }
}

const getReleaseFull = tool(
  "get_release_full",
  "Get full release details from Discogs including tracklist with credits, formats, notes, identifiers, and manufacturing companies.",
  {
    release_id: z.number().describe("Discogs release ID"),
  },
  getReleaseFullHandler,
);

// --- Tool 9: get_marketplace_stats ---

export async function getMarketplaceStatsHandler(args: {
  release_id: number;
}) {
  try {
    const data = await discogsFetch(
      `/marketplace/stats/${args.release_id}`,
    );
    return toolResult(data);
  } catch (error) {
    return toolError(error);
  }
}

const getMarketplaceStats = tool(
  "get_marketplace_stats",
  "Get marketplace pricing stats for a Discogs release — lowest price, number for sale, and sale status.",
  {
    release_id: z.number().describe("Discogs release ID"),
  },
  getMarketplaceStatsHandler,
);
```

Update the final `tools` array:

```typescript
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
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/discogs.test.ts`
Expected: All 11 tests PASS

**Step 5: Commit**

```bash
git add src/servers/discogs.ts tests/discogs.test.ts
git commit -m "feat: add Discogs full release and marketplace stats tools"
```

---

### Task 7: Register Discogs server and update UI

**Files:**
- Modify: `src/servers/index.ts`
- Modify: `src/ui/app.ts`

**Step 1: Write the failing test**

Add to `tests/discogs.test.ts`:

```typescript
describe("server registration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("registers discogs server when keys are set", async () => {
    process.env.DISCOGS_KEY = "test-key";
    process.env.DISCOGS_SECRET = "test-secret";
    const { getActiveServers } = await import("../src/servers/index.js");
    const servers = getActiveServers();
    expect(servers.discogs).toBeDefined();
  });

  it("does not register discogs without keys", async () => {
    delete process.env.DISCOGS_KEY;
    delete process.env.DISCOGS_SECRET;
    const { getActiveServers } = await import("../src/servers/index.js");
    const servers = getActiveServers();
    expect(servers.discogs).toBeUndefined();
  });
});
```

**Step 2: Run tests to verify failure**

Run: `npx vitest run tests/discogs.test.ts`
Expected: FAIL — discogs not registered

**Step 3: Update server registry**

In `src/servers/index.ts`, add the import and conditional registration:

```typescript
import { musicbrainzServer } from "./musicbrainz.js";
import { discogsServer } from "./discogs.js";

export function getActiveServers(): Record<string, any> {
  const servers: Record<string, any> = {
    musicbrainz: musicbrainzServer,
  };

  if (process.env.DISCOGS_KEY && process.env.DISCOGS_SECRET) {
    servers.discogs = discogsServer;
  }

  return servers;
}
```

Remove the old comment `// if (process.env.DISCOGS_TOKEN) servers.discogs = discogsServer;`.

**Step 4: Run tests to verify registration works**

Run: `npx vitest run tests/discogs.test.ts`
Expected: All 13 tests PASS

**Step 5: Add tool progress messages to UI**

In `src/ui/app.ts`, add cases to the `getToolProgressMessage` switch statement (after the MusicBrainz cases):

```typescript
    // Discogs tools
    case "search_discogs":
      return `Searching Discogs for "${input.query}"...`;
    case "get_artist_discogs":
      return "Fetching artist profile from Discogs...";
    case "get_artist_releases":
      return "Loading artist discography from Discogs...";
    case "get_label":
      return "Fetching label profile from Discogs...";
    case "get_label_releases":
      return "Loading label catalog from Discogs...";
    case "get_master":
      return "Fetching master release from Discogs...";
    case "get_master_versions":
      return "Loading release versions from Discogs...";
    case "get_release_full":
      return "Fetching full release details from Discogs...";
    case "get_marketplace_stats":
      return "Checking marketplace prices on Discogs...";
```

**Step 6: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS (existing 19 + new Discogs tests)

**Step 7: Commit**

```bash
git add src/servers/index.ts src/ui/app.ts tests/discogs.test.ts
git commit -m "feat: register Discogs server and add tool progress messages"
```

---

### Task 8: Update system prompt with Discogs capabilities

**Files:**
- Modify: `src/agent/system-prompt.ts`
- Modify: `tests/agent.test.ts`

**Step 1: Write the failing test**

Add to the "system prompt" describe block in `tests/agent.test.ts`:

```typescript
  it("mentions Discogs capabilities", async () => {
    const { getSystemPrompt } = await import("../src/agent/system-prompt.js");
    const prompt = getSystemPrompt();
    expect(prompt).toContain("Discogs");
  });
```

**Step 2: Run test to verify failure**

Run: `npx vitest run tests/agent.test.ts`
Expected: FAIL — prompt does not contain "Discogs"

**Step 3: Update system prompt**

In `src/agent/system-prompt.ts`, add a Discogs section after the MusicBrainz section:

```typescript
### Discogs (requires DISCOGS_KEY + DISCOGS_SECRET)
You can search Discogs and retrieve:
- **Artist profiles**: Bios, members, aliases, images
- **Discographies**: Full release lists sorted by year, title, or format
- **Label information**: Label profiles, sublabels, parent labels, catalogs
- **Master releases**: Canonical versions across all formats and pressings
- **Full release details**: Tracklists with credits, formats, notes, identifiers, manufacturing companies
- **Marketplace pricing**: Lowest price, number for sale, sale status

Use Discogs for vinyl/physical release data, detailed credits, pressing variants, and marketplace pricing. Use MusicBrainz for general music metadata, relationships, and ISRCs.
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/agent.test.ts`
Expected: All tests PASS

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add src/agent/system-prompt.ts tests/agent.test.ts
git commit -m "feat: add Discogs capabilities to system prompt"
```

---

### Task 9: Final verification — all tests pass, manual smoke test

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS (previous 19 + new Discogs tests ≈ 30+)

**Step 2: Verify server count**

Run: `DISCOGS_KEY=test DISCOGS_SECRET=test npx tsx src/cli.ts`
Expected: App launches. Type `/servers` or similar to confirm both musicbrainz and discogs are active.

**Step 3: Verify without keys**

Run: `npx tsx src/cli.ts`
Expected: App launches with only musicbrainz active. Discogs not registered.

**Step 4: Final commit (if any cleanup needed)**

If all is clean, no commit needed. Otherwise:
```bash
git add -A
git commit -m "chore: final cleanup for Discogs server"
```
