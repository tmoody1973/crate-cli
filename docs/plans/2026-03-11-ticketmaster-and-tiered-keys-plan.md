# Ticketmaster MCP Server & Two-Tier Key Architecture — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Ticketmaster Discovery API MCP server and introduce embedded default keys for Ticketmaster, Last.fm, and Discogs so new users get research sources with zero setup.

**Architecture:** New `src/servers/ticketmaster.ts` with 4 tools following `tool()` + `createSdkMcpServer()` pattern. `src/utils/config.ts` gets `resolveKey()` that checks user env vars first, embedded defaults second. Server registration updated to use `resolveKey()`.

**Tech Stack:** TypeScript, Zod, Vitest, Ticketmaster Discovery API v2

---

### Task 1: Add `resolveKey()` and `isUsingEmbeddedKey()` to config

**Files:**
- Modify: `src/utils/config.ts`
- Create: `tests/config.test.ts`

**Step 1: Write the failing tests**

```typescript
// tests/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveKey, isUsingEmbeddedKey } from "../src/utils/config.js";

describe("resolveKey", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns user env var when present", () => {
    process.env.TICKETMASTER_API_KEY = "user-key-123";
    expect(resolveKey("TICKETMASTER_API_KEY")).toBe("user-key-123");
  });

  it("returns embedded key when env var is absent", () => {
    delete process.env.TICKETMASTER_API_KEY;
    const result = resolveKey("TICKETMASTER_API_KEY");
    expect(result).toBeDefined();
    expect(result).not.toBe("");
  });

  it("returns undefined when no env var and no embedded key", () => {
    delete process.env.GENIUS_ACCESS_TOKEN;
    expect(resolveKey("GENIUS_ACCESS_TOKEN")).toBeUndefined();
  });

  it("user env var takes priority over embedded key", () => {
    process.env.LASTFM_API_KEY = "my-custom-key";
    expect(resolveKey("LASTFM_API_KEY")).toBe("my-custom-key");
  });
});

describe("isUsingEmbeddedKey", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns true when user has no env vars for an embedded service", () => {
    delete process.env.TICKETMASTER_API_KEY;
    expect(isUsingEmbeddedKey("ticketmaster")).toBe(true);
  });

  it("returns false when user provides their own key", () => {
    process.env.TICKETMASTER_API_KEY = "user-key";
    expect(isUsingEmbeddedKey("ticketmaster")).toBe(false);
  });

  it("returns false for services without embedded keys", () => {
    expect(isUsingEmbeddedKey("genius")).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/config.test.ts`
Expected: FAIL — `resolveKey` and `isUsingEmbeddedKey` not exported

**Step 3: Implement `resolveKey()` and `isUsingEmbeddedKey()`**

Add to `src/utils/config.ts` after the existing imports:

```typescript
const EMBEDDED_KEYS: Record<string, Record<string, string>> = {
  ticketmaster: { TICKETMASTER_API_KEY: "PLACEHOLDER_TICKETMASTER_KEY" },
  lastfm: { LASTFM_API_KEY: "PLACEHOLDER_LASTFM_KEY" },
  discogs: { DISCOGS_KEY: "PLACEHOLDER_DISCOGS_KEY", DISCOGS_SECRET: "PLACEHOLDER_DISCOGS_SECRET" },
};

// Reverse lookup: env var name → embedded value
const EMBEDDED_KEY_LOOKUP: Record<string, string> = {};
for (const keys of Object.values(EMBEDDED_KEYS)) {
  for (const [envVar, value] of Object.entries(keys)) {
    EMBEDDED_KEY_LOOKUP[envVar] = value;
  }
}

/** Resolve an API key: user env var wins, embedded default as fallback. */
export function resolveKey(envVar: string): string | undefined {
  return process.env[envVar] || EMBEDDED_KEY_LOOKUP[envVar] || undefined;
}

/** Check if a service is using its embedded default key (no user override). */
export function isUsingEmbeddedKey(service: string): boolean {
  const serviceKeys = EMBEDDED_KEYS[service];
  if (!serviceKeys) return false;
  return Object.keys(serviceKeys).every((k) => !process.env[k]);
}
```

Update `getConfig()` to use `resolveKey()`:

```typescript
export function getConfig(): CrateConfig {
  const allKeys = Object.values(KEY_GATED_SERVERS).flat();
  const availableKeys = allKeys.filter((key) => !!resolveKey(key));

  return {
    defaultModel: DEFAULT_MODEL,
    availableKeys,
    availableModels: AVAILABLE_MODELS,
    keyGatedServers: KEY_GATED_SERVERS,
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/config.test.ts`
Expected: PASS (all 6 tests)

**Step 5: Commit**

```bash
git add src/utils/config.ts tests/config.test.ts
git commit -m "feat: add resolveKey() and isUsingEmbeddedKey() for two-tier key architecture"
```

---

### Task 2: Update server registration to use `resolveKey()`

**Files:**
- Modify: `src/servers/index.ts`

**Step 1: Update `getActiveServers()` to use `resolveKey()`**

```typescript
// At the top, add import:
import { resolveKey } from "../utils/config.js";

// Replace the key-gated conditions:
// OLD:
// if (process.env.DISCOGS_KEY && process.env.DISCOGS_SECRET) servers.discogs = discogsServer;
// NEW:
if (resolveKey("DISCOGS_KEY") && resolveKey("DISCOGS_SECRET"))
  servers.discogs = discogsServer;

// OLD:
// if (process.env.LASTFM_API_KEY) servers.lastfm = lastfmServer;
// NEW:
if (resolveKey("LASTFM_API_KEY")) servers.lastfm = lastfmServer;

// The commented-out ticketmaster line stays commented for now (Task 4 adds it)
// Keep all other key checks using process.env (they're Tier 2, no embedded keys)
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All existing tests still pass

**Step 4: Commit**

```bash
git add src/servers/index.ts
git commit -m "refactor: use resolveKey() for Discogs and Last.fm server registration"
```

---

### Task 3: Write Ticketmaster server tests

**Files:**
- Create: `tests/ticketmaster.test.ts`

**Step 1: Write the test file**

```typescript
// tests/ticketmaster.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  searchEventsHandler,
  searchAttractionsHandler,
  searchVenuesHandler,
  getEventDetailsHandler,
} from "../src/servers/ticketmaster.js";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
});

function mockResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

describe("searchEventsHandler", () => {
  it("returns shaped event data from Ticketmaster response", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        _embedded: {
          events: [
            {
              name: "Khruangbin Live",
              id: "evt-123",
              url: "https://ticketmaster.com/event/evt-123",
              dates: {
                start: { localDate: "2026-04-15", localTime: "20:00:00" },
                status: { code: "onsale" },
              },
              priceRanges: [{ min: 35, max: 75, currency: "USD" }],
              images: [{ url: "https://img.com/event.jpg", width: 640, height: 480 }],
              _embedded: {
                venues: [
                  {
                    name: "Metro Chicago",
                    city: { name: "Chicago" },
                    state: { stateCode: "IL" },
                  },
                ],
                attractions: [{ name: "Khruangbin" }, { name: "Men I Trust" }],
              },
            },
          ],
        },
        page: { totalElements: 1 },
      }),
    );

    const result = await searchEventsHandler({ keyword: "Khruangbin", size: 10 });
    const data = JSON.parse(result.content[0].text);

    expect(data.events).toHaveLength(1);
    expect(data.events[0]).toMatchObject({
      name: "Khruangbin Live",
      date: "2026-04-15",
      time: "20:00:00",
      venue: "Metro Chicago",
      city: "Chicago, IL",
      status: "onsale",
      artists: ["Khruangbin", "Men I Trust"],
    });
    expect(data.events[0].url).toContain("ticketmaster.com");
    expect(data.events[0].priceRange).toBe("$35 - $75 USD");
  });

  it("applies classificationName=music filter", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ _embedded: { events: [] }, page: { totalElements: 0 } }));

    await searchEventsHandler({ keyword: "test" });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("classificationName=music");
  });

  it("handles empty results gracefully", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ page: { totalElements: 0 } }));

    const result = await searchEventsHandler({ keyword: "nonexistent" });
    const data = JSON.parse(result.content[0].text);

    expect(data.events).toEqual([]);
  });

  it("handles 429 rate limit with graceful error", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ errors: [{ detail: "Rate limit exceeded" }] }, 429));

    const result = await searchEventsHandler({ keyword: "test" });
    const data = JSON.parse(result.content[0].text);

    expect(data.error).toContain("rate limit");
  });

  it("filters by city and state when provided", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ _embedded: { events: [] }, page: { totalElements: 0 } }));

    await searchEventsHandler({ keyword: "jazz", city: "Chicago", stateCode: "IL" });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("city=Chicago");
    expect(calledUrl).toContain("stateCode=IL");
  });
});

describe("searchAttractionsHandler", () => {
  it("returns shaped attraction data", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        _embedded: {
          attractions: [
            {
              name: "Khruangbin",
              id: "att-456",
              url: "https://ticketmaster.com/artist/att-456",
              classifications: [
                { genre: { name: "Rock" }, subGenre: { name: "Alternative" } },
              ],
              images: [{ url: "https://img.com/artist.jpg" }],
              upcomingEvents: { _total: 12 },
            },
          ],
        },
      }),
    );

    const result = await searchAttractionsHandler({ keyword: "Khruangbin" });
    const data = JSON.parse(result.content[0].text);

    expect(data.attractions).toHaveLength(1);
    expect(data.attractions[0]).toMatchObject({
      name: "Khruangbin",
      id: "att-456",
      genre: "Rock",
      subGenre: "Alternative",
      upcomingEvents: 12,
    });
  });
});

describe("searchVenuesHandler", () => {
  it("returns shaped venue data", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        _embedded: {
          venues: [
            {
              name: "Metro",
              id: "ven-789",
              url: "https://ticketmaster.com/venue/ven-789",
              city: { name: "Chicago" },
              state: { stateCode: "IL" },
              country: { name: "United States" },
              address: { line1: "3730 N Clark St" },
              images: [{ url: "https://img.com/venue.jpg" }],
              upcomingEvents: { _total: 45 },
            },
          ],
        },
      }),
    );

    const result = await searchVenuesHandler({ keyword: "Metro Chicago" });
    const data = JSON.parse(result.content[0].text);

    expect(data.venues).toHaveLength(1);
    expect(data.venues[0]).toMatchObject({
      name: "Metro",
      city: "Chicago",
      state: "IL",
      country: "United States",
      address: "3730 N Clark St",
      upcomingEvents: 45,
    });
  });
});

describe("getEventDetailsHandler", () => {
  it("returns shaped event detail data", async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({
        name: "Khruangbin Live",
        url: "https://ticketmaster.com/event/evt-123",
        dates: {
          start: { localDate: "2026-04-15", localTime: "20:00:00" },
          status: { code: "onsale" },
        },
        priceRanges: [{ min: 35, max: 75, currency: "USD" }],
        seatmap: { staticUrl: "https://img.com/seatmap.png" },
        sales: {
          presales: [
            { name: "Artist Presale", startDateTime: "2026-03-01T10:00:00Z", endDateTime: "2026-03-03T10:00:00Z" },
          ],
        },
        classifications: [
          { genre: { name: "Rock" }, subGenre: { name: "Psychedelic" } },
        ],
        _embedded: {
          venues: [
            {
              name: "Metro Chicago",
              city: { name: "Chicago" },
              state: { stateCode: "IL" },
              address: { line1: "3730 N Clark St" },
            },
          ],
          attractions: [{ name: "Khruangbin" }],
        },
      }),
    );

    const result = await getEventDetailsHandler({ eventId: "evt-123" });
    const data = JSON.parse(result.content[0].text);

    expect(data).toMatchObject({
      name: "Khruangbin Live",
      date: "2026-04-15",
      time: "20:00:00",
      status: "onsale",
      artists: ["Khruangbin"],
      venue: { name: "Metro Chicago", city: "Chicago, IL" },
    });
    expect(data.presales).toHaveLength(1);
    expect(data.classification).toMatchObject({ genre: "Rock", subGenre: "Psychedelic" });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ticketmaster.test.ts`
Expected: FAIL — module `../src/servers/ticketmaster.js` not found

**Step 3: Commit the test file**

```bash
git add tests/ticketmaster.test.ts
git commit -m "test: add Ticketmaster MCP server test suite"
```

---

### Task 4: Implement Ticketmaster MCP server

**Files:**
- Create: `src/servers/ticketmaster.ts`

**Step 1: Implement the server**

```typescript
// src/servers/ticketmaster.ts
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { resolveKey } from "../utils/config.js";

const BASE_URL = "https://app.ticketmaster.com/discovery/v2";
const RATE_LIMIT_MS = 220; // 5 req/sec = 200ms, add 20ms buffer
const FETCH_TIMEOUT_MS = 15_000;

let lastRequest = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequest;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
  lastRequest = Date.now();
}

function getApiKey(): string {
  const key = resolveKey("TICKETMASTER_API_KEY");
  if (!key) throw new Error("Ticketmaster API key not configured");
  return key;
}

async function tmFetch(path: string): Promise<any> {
  await rateLimit();
  const separator = path.includes("?") ? "&" : "?";
  const url = `${BASE_URL}${path}${separator}apikey=${getApiKey()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });

    if (res.status === 429) {
      return {
        _rateLimited: true,
        error: "Ticketmaster rate limit reached. Try again in a moment, or add your own Ticketmaster API key for priority access.",
      };
    }

    if (!res.ok) {
      throw new Error(`Ticketmaster API error: ${res.status}`);
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

function toolResult(data: unknown): { content: [{ type: "text"; text: string }] } {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(error: unknown): { content: [{ type: "text"; text: string }] } {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }] };
}

// --- Response shapers ---

function shapeEvent(event: any): Record<string, unknown> {
  const venues = event._embedded?.venues ?? [];
  const attractions = event._embedded?.attractions ?? [];
  const venue = venues[0];
  const city = venue
    ? `${venue.city?.name ?? ""}${venue.state?.stateCode ? ", " + venue.state.stateCode : ""}`
    : "";
  const prices = event.priceRanges?.[0];

  return {
    name: event.name ?? "",
    date: event.dates?.start?.localDate ?? "",
    time: event.dates?.start?.localTime ?? "",
    venue: venue?.name ?? "",
    city,
    priceRange: prices ? `$${prices.min} - $${prices.max} ${prices.currency ?? "USD"}` : "N/A",
    status: event.dates?.status?.code ?? "unknown",
    url: event.url ?? "",
    artists: attractions.map((a: any) => a.name),
  };
}

function shapeAttraction(attraction: any): Record<string, unknown> {
  const cls = attraction.classifications?.[0];
  return {
    name: attraction.name ?? "",
    id: attraction.id ?? "",
    genre: cls?.genre?.name ?? "",
    subGenre: cls?.subGenre?.name ?? "",
    url: attraction.url ?? "",
    imageUrl: attraction.images?.[0]?.url ?? "",
    upcomingEvents: attraction.upcomingEvents?._total ?? 0,
  };
}

function shapeVenue(venue: any): Record<string, unknown> {
  return {
    name: venue.name ?? "",
    city: venue.city?.name ?? "",
    state: venue.state?.stateCode ?? "",
    country: venue.country?.name ?? "",
    address: venue.address?.line1 ?? "",
    url: venue.url ?? "",
    imageUrl: venue.images?.[0]?.url ?? "",
    upcomingEvents: venue.upcomingEvents?._total ?? 0,
  };
}

// --- Handlers (exported for testing) ---

export async function searchEventsHandler(args: {
  keyword: string;
  city?: string;
  stateCode?: string;
  startDateTime?: string;
  endDateTime?: string;
  size?: number;
}) {
  try {
    const params = new URLSearchParams({
      keyword: args.keyword,
      classificationName: "music",
      size: String(args.size ?? 20),
    });
    if (args.city) params.set("city", args.city);
    if (args.stateCode) params.set("stateCode", args.stateCode);
    if (args.startDateTime) params.set("startDateTime", args.startDateTime);
    if (args.endDateTime) params.set("endDateTime", args.endDateTime);

    const data = await tmFetch(`/events.json?${params.toString()}`);
    if (data._rateLimited) return toolResult(data);

    const events = (data._embedded?.events ?? []).map(shapeEvent);
    return toolResult({ events, total: data.page?.totalElements ?? 0 });
  } catch (error) {
    return toolError(error);
  }
}

export async function searchAttractionsHandler(args: {
  keyword: string;
  size?: number;
}) {
  try {
    const params = new URLSearchParams({
      keyword: args.keyword,
      size: String(args.size ?? 10),
    });

    const data = await tmFetch(`/attractions.json?${params.toString()}`);
    if (data._rateLimited) return toolResult(data);

    const attractions = (data._embedded?.attractions ?? []).map(shapeAttraction);
    return toolResult({ attractions });
  } catch (error) {
    return toolError(error);
  }
}

export async function searchVenuesHandler(args: {
  keyword: string;
  city?: string;
  stateCode?: string;
  size?: number;
}) {
  try {
    const params = new URLSearchParams({
      keyword: args.keyword,
      size: String(args.size ?? 10),
    });
    if (args.city) params.set("city", args.city);
    if (args.stateCode) params.set("stateCode", args.stateCode);

    const data = await tmFetch(`/venues.json?${params.toString()}`);
    if (data._rateLimited) return toolResult(data);

    const venues = (data._embedded?.venues ?? []).map(shapeVenue);
    return toolResult({ venues });
  } catch (error) {
    return toolError(error);
  }
}

export async function getEventDetailsHandler(args: { eventId: string }) {
  try {
    const data = await tmFetch(`/events/${encodeURIComponent(args.eventId)}.json`);
    if (data._rateLimited) return toolResult(data);

    const venues = data._embedded?.venues ?? [];
    const attractions = data._embedded?.attractions ?? [];
    const venue = venues[0];
    const prices = data.priceRanges?.[0];
    const cls = data.classifications?.[0];

    return toolResult({
      name: data.name ?? "",
      date: data.dates?.start?.localDate ?? "",
      time: data.dates?.start?.localTime ?? "",
      venue: venue
        ? {
            name: venue.name ?? "",
            city: `${venue.city?.name ?? ""}${venue.state?.stateCode ? ", " + venue.state.stateCode : ""}`,
            address: venue.address?.line1 ?? "",
          }
        : null,
      artists: attractions.map((a: any) => a.name),
      priceRange: prices ? `$${prices.min} - $${prices.max} ${prices.currency ?? "USD"}` : "N/A",
      status: data.dates?.status?.code ?? "unknown",
      url: data.url ?? "",
      seatmap: data.seatmap?.staticUrl ?? "",
      presales: (data.sales?.presales ?? []).map((p: any) => ({
        name: p.name,
        startDateTime: p.startDateTime,
        endDateTime: p.endDateTime,
      })),
      classification: cls
        ? { genre: cls.genre?.name ?? "", subGenre: cls.subGenre?.name ?? "" }
        : null,
    });
  } catch (error) {
    return toolError(error);
  }
}

// --- Tool definitions ---

const searchEvents = tool(
  "search_events",
  "Search for upcoming music events and concerts on Ticketmaster. Filter by artist name, city, state, and date range. Returns event names, dates, venues, price ranges, and ticket links.",
  {
    keyword: z.string().max(200).describe("Artist name, event name, or search term"),
    city: z.string().max(100).optional().describe("Filter by city name (e.g., 'Chicago')"),
    stateCode: z.string().max(5).optional().describe("Filter by US state code (e.g., 'IL')"),
    startDateTime: z.string().optional().describe("Start date/time in ISO 8601 (e.g., '2026-04-01T00:00:00Z')"),
    endDateTime: z.string().optional().describe("End date/time in ISO 8601"),
    size: z.number().min(1).max(50).optional().describe("Number of results (default 20)"),
  },
  searchEventsHandler,
);

const searchAttractions = tool(
  "search_attractions",
  "Search for artists, bands, and performers on Ticketmaster. Returns artist name, genre, Ticketmaster URL, image, and number of upcoming events.",
  {
    keyword: z.string().max(200).describe("Artist or performer name to search for"),
    size: z.number().min(1).max(50).optional().describe("Number of results (default 10)"),
  },
  searchAttractionsHandler,
);

const searchVenues = tool(
  "search_venues",
  "Search for music venues on Ticketmaster. Returns venue name, location, address, and number of upcoming events.",
  {
    keyword: z.string().max(200).describe("Venue name or search term"),
    city: z.string().max(100).optional().describe("Filter by city name"),
    stateCode: z.string().max(5).optional().describe("Filter by US state code"),
    size: z.number().min(1).max(50).optional().describe("Number of results (default 10)"),
  },
  searchVenuesHandler,
);

const getEventDetails = tool(
  "get_event_details",
  "Get full details for a specific Ticketmaster event by ID. Returns venue, artists, price ranges, presale dates, seat map, and genre classification.",
  {
    eventId: z.string().describe("Ticketmaster event ID"),
  },
  getEventDetailsHandler,
);

// --- Server export ---

export const ticketmasterTools = [searchEvents, searchAttractions, searchVenues, getEventDetails];

export const ticketmasterServer = createSdkMcpServer({
  name: "ticketmaster",
  version: "1.0.0",
  tools: ticketmasterTools,
});
```

**Step 2: Run tests to verify they pass**

Run: `npx vitest run tests/ticketmaster.test.ts`
Expected: PASS (all tests)

**Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add src/servers/ticketmaster.ts
git commit -m "feat: add Ticketmaster Discovery API MCP server with 4 tools"
```

---

### Task 5: Register Ticketmaster server and update allServers list

**Files:**
- Modify: `src/servers/index.ts`

**Step 1: Add import and registration**

At the top of `src/servers/index.ts`, add:
```typescript
import { ticketmasterServer } from "./ticketmaster.js";
```

In `getActiveServers()`, replace the commented-out Ticketmaster line:
```typescript
// OLD:
// if (process.env.TICKETMASTER_API_KEY) servers.events = eventsServer;
// NEW:
if (resolveKey("TICKETMASTER_API_KEY"))
  servers.ticketmaster = ticketmasterServer;
```

In `getServerStatus()`, update `allServers` array:
```typescript
// Replace "events" with "ticketmaster" in the allServers array
const allServers = [
  "musicbrainz", "discogs", "memory", "lastfm",
  "spotify", "genius", "ticketmaster", "wikipedia", "bandcamp", "youtube",
  "radio", "news", "collection", "playlist", "websearch", "influence", "influencecache", "telegraph", "tumblr", "browser", "whosampled",
];
```

Also rename `events` to `ticketmaster` in `src/utils/config.ts` KEY_GATED_SERVERS:
```typescript
// OLD:
events: ["TICKETMASTER_API_KEY"],
// NEW:
ticketmaster: ["TICKETMASTER_API_KEY"],
```

**Step 2: Run type check and tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS

**Step 3: Commit**

```bash
git add src/servers/index.ts src/utils/config.ts
git commit -m "feat: register Ticketmaster server with resolveKey() gating"
```

---

### Task 6: Add Ticketmaster tool progress messages to UI

**Files:**
- Modify: `src/ui/app.ts`

**Step 1: Add progress messages**

In the `getToolProgressMessage()` function (the big switch statement), add before the `default` case:

```typescript
case "search_events":
  return `Searching for upcoming events${args.keyword ? ` for "${args.keyword}"` : ""}${args.city ? ` in ${args.city}` : ""}...`;
case "search_attractions":
  return `Looking up "${args.keyword ?? "artist"}" on Ticketmaster...`;
case "search_venues":
  return `Finding venues${args.keyword ? ` matching "${args.keyword}"` : ""}...`;
case "get_event_details":
  return "Getting event details from Ticketmaster...";
```

Add to `SERVER_LABELS`:
```typescript
ticketmaster: "Ticketmaster",
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/ui/app.ts
git commit -m "feat: add Ticketmaster tool progress messages to UI"
```

---

### Task 7: Update system prompt with Ticketmaster and tier awareness

**Files:**
- Modify: `src/agent/system-prompt.ts` (or `SOUL.md` if that's where the data sources section lives)

**Step 1: Check which file has the data sources text**

Read `SOUL.md` in the project root — the system prompt loads it. If the data sources section is in `SOUL.md`, modify that. If it's in `system-prompt.ts`, modify there.

**Step 2: Add Ticketmaster documentation**

Add after the "Sample connections" section:

```
**Live events:** Ticketmaster (search concerts/shows by artist or city, look up venues, get event details with pricing and presale dates — classificationName=music filter applied automatically)
```

Update the server count from "18 MCP servers" to "19 MCP servers".

Add tier awareness note at the end of the data sources section:

```
**Key tiers:** Discogs, Last.fm, and Ticketmaster use shared default keys — they work for all users with no setup. If you receive a rate limit error from these services, mention that the user can add their own API key in settings for priority access. Other services (Genius, YouTube, Tumblr, etc.) require the user to add their own key.
```

**Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add SOUL.md  # or src/agent/system-prompt.ts
git commit -m "docs: add Ticketmaster to system prompt and add tier awareness"
```

---

### Task 8: Update README with Ticketmaster and two-tier model

**Files:**
- Modify: `README.md`

**Step 1: Add Ticketmaster to the server list**

Add Ticketmaster to the MCP servers table/list in README.md. Update server count. Add a "Key Tiers" section explaining:

- Tier 1 (zero-config): MusicBrainz, Wikipedia, Bandcamp, WhoSampled, Ticketmaster, Last.fm, Discogs — work out of the box
- Tier 2 (BYOK): Genius, YouTube, Tumblr, Kernel, etc. — add your own key for these

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add Ticketmaster server and two-tier key model to README"
```

---

### Task 9: Replace placeholder embedded keys with real keys

**Files:**
- Modify: `src/utils/config.ts`

**Step 1: Register developer accounts**

Register for API keys under a dedicated "Crate" developer account:
1. Ticketmaster: https://developer-acct.ticketmaster.com/user/register
2. Last.fm: https://www.last.fm/api/account/create (if not already using a shared key)
3. Discogs: https://www.discogs.com/settings/developers (if not already using a shared key)

**Step 2: Replace placeholder values**

In `src/utils/config.ts`, replace `"PLACEHOLDER_TICKETMASTER_KEY"` etc. with real keys.

**Step 3: Run full test suite**

Run: `npx vitest run`
Expected: PASS

**Step 4: Commit**

```bash
git add src/utils/config.ts
git commit -m "chore: add embedded API keys for Tier 1 services"
```

---

### Task 10: Integration test — run full CLI with new servers

**Step 1: Test with no env vars (embedded keys only)**

```bash
# Remove Discogs/Last.fm/Ticketmaster env vars temporarily
unset DISCOGS_KEY DISCOGS_SECRET LASTFM_API_KEY TICKETMASTER_API_KEY
npx tsx src/cli.ts
```

Verify:
- Discogs, Last.fm, Ticketmaster all show as active servers on startup
- Can run a query that triggers Ticketmaster (e.g., "What concerts are happening in Chicago this week?")

**Step 2: Test with user env vars (override)**

```bash
export TICKETMASTER_API_KEY="your-own-key"
npx tsx src/cli.ts
```

Verify: Ticketmaster still active, uses your key instead of embedded

**Step 3: Run full test suite one final time**

Run: `npx vitest run && npx tsc --noEmit`
Expected: ALL PASS

**Step 4: Commit any fixes**

```bash
git commit -am "fix: integration test fixes for Ticketmaster and tiered keys"
```

---

### Task 11: Bump version and publish

**Step 1: Bump version in package.json**

Update version to next minor (e.g., `0.6.0` since this adds a new server + architectural change).

**Step 2: Build and publish**

```bash
npm run build
npm publish
```

**Step 3: Commit version bump**

```bash
git add package.json
git commit -m "chore: bump version to 0.6.0"
```
