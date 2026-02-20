# Initial Scaffold Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the foundational project scaffold with a working vertical slice: pi-tui REPL + CrateAgent + MusicBrainz MCP server.

**Architecture:** Claude Agent SDK V1 `query()` wraps the agent loop as a subprocess. Custom MCP servers run in-process via `createSdkMcpServer()`. pi-tui handles terminal rendering with differential updates. A thin `CrateAgent` class manages session state and model selection.

**Tech Stack:** TypeScript, Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`), pi-tui (`@mariozechner/pi-tui`), Zod, Vitest, tsx

**Reference:** See `docs/plans/2026-02-20-initial-scaffold-design.md` for full design rationale.

---

### Task 1: Project Initialization

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.example`

**Step 1: Create package.json**

```json
{
  "name": "crate-cli",
  "version": "0.1.0",
  "description": "AI-powered music research agent for the terminal",
  "type": "module",
  "main": "src/cli.ts",
  "scripts": {
    "dev": "tsx src/cli.ts",
    "dev:opus": "tsx src/cli.ts --model opus",
    "dev:haiku": "tsx src/cli.ts --model haiku",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "keywords": ["music", "research", "cli", "ai", "agent"],
  "license": "MIT"
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Step 3: Create .gitignore**

```
node_modules/
dist/
.env
.DS_Store
*.log
```

**Step 4: Create .env.example**

```bash
# Required
ANTHROPIC_API_KEY=your-anthropic-api-key

# Recommended (future servers)
# DISCOGS_TOKEN=
# MEM0_API_KEY=
# LASTFM_API_KEY=
# SPOTIFY_CLIENT_ID=
# SPOTIFY_CLIENT_SECRET=

# Optional (future servers)
# GENIUS_ACCESS_TOKEN=
# YOUTUBE_API_KEY=
# TICKETMASTER_API_KEY=
# WIKIPEDIA_ACCESS_TOKEN=
```

**Step 5: Install dependencies**

Run:
```bash
npm install @anthropic-ai/claude-agent-sdk zod @mariozechner/pi-tui chalk dotenv
npm install -D tsx vitest typescript @types/node
```

Expected: `package-lock.json` created, `node_modules/` populated, no errors.

**Step 6: Create directory structure**

Run:
```bash
mkdir -p src/agent src/servers src/ui src/utils tests
```

**Step 7: Verify typecheck works**

Run: `npx tsc --noEmit`
Expected: No errors (no source files yet, should pass cleanly).

**Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore .env.example
git commit -m "chore: initialize project with dependencies and config"
```

---

### Task 2: Config Utility

**Files:**
- Create: `src/utils/config.ts`
- Test: `tests/config.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/config.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns default model when none specified", async () => {
    const { getConfig } = await import("../src/utils/config.js");
    const config = getConfig();
    expect(config.defaultModel).toBe("claude-sonnet-4-6");
  });

  it("detects available API keys", async () => {
    process.env.DISCOGS_TOKEN = "test-token";
    const { getConfig } = await import("../src/utils/config.js");
    const config = getConfig();
    expect(config.availableKeys).toContain("DISCOGS_TOKEN");
  });

  it("does not list missing keys as available", async () => {
    delete process.env.DISCOGS_TOKEN;
    const { getConfig } = await import("../src/utils/config.js");
    const config = getConfig();
    expect(config.availableKeys).not.toContain("DISCOGS_TOKEN");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config.test.ts`
Expected: FAIL — module not found.

**Step 3: Write minimal implementation**

```typescript
// src/utils/config.ts
import "dotenv/config";

const DEFAULT_MODEL = "claude-sonnet-4-6";

const KEY_GATED_SERVERS: Record<string, string[]> = {
  memory: ["MEM0_API_KEY"],
  discogs: ["DISCOGS_TOKEN"],
  spotify: ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET"],
  lastfm: ["LASTFM_API_KEY"],
  genius: ["GENIUS_ACCESS_TOKEN"],
  events: ["TICKETMASTER_API_KEY"],
  wikipedia: ["WIKIPEDIA_ACCESS_TOKEN"],
};

const AVAILABLE_MODELS: Record<string, string> = {
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-6",
  haiku: "claude-haiku-4-5-20251001",
};

export interface CrateConfig {
  defaultModel: string;
  availableKeys: string[];
  availableModels: Record<string, string>;
  keyGatedServers: Record<string, string[]>;
}

export function getConfig(): CrateConfig {
  const allKeys = Object.values(KEY_GATED_SERVERS).flat();
  const availableKeys = allKeys.filter((key) => !!process.env[key]);

  return {
    defaultModel: DEFAULT_MODEL,
    availableKeys,
    availableModels: AVAILABLE_MODELS,
    keyGatedServers: KEY_GATED_SERVERS,
  };
}

export function resolveModel(alias: string): string {
  return AVAILABLE_MODELS[alias.toLowerCase()] ?? alias;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/config.test.ts`
Expected: 3 tests PASS.

**Step 5: Commit**

```bash
git add src/utils/config.ts tests/config.test.ts
git commit -m "feat: add config utility with model resolution and key detection"
```

---

### Task 3: MusicBrainz Server — Rate Limiter + search_artist

**Files:**
- Create: `src/servers/musicbrainz.ts`
- Test: `tests/musicbrainz.test.ts`

**Step 1: Write the failing tests**

```typescript
// tests/musicbrainz.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("musicbrainz", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("rateLimit", () => {
    it("enforces minimum delay between requests", async () => {
      const { rateLimit } = await import("../src/servers/musicbrainz.js");
      const start = Date.now();
      await rateLimit();
      await rateLimit();
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(1000);
    });
  });

  describe("searchArtist", () => {
    it("searches MusicBrainz and returns formatted results", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          artists: [
            {
              id: "mbid-123",
              name: "Madlib",
              disambiguation: "US producer",
              type: "Person",
              country: "US",
              score: 100,
            },
          ],
        }),
      });

      const { searchArtistHandler } = await import(
        "../src/servers/musicbrainz.js"
      );
      const result = await searchArtistHandler({ query: "Madlib" });

      expect(result.content[0].type).toBe("text");
      const data = JSON.parse(result.content[0].text);
      expect(data[0].name).toBe("Madlib");
      expect(data[0].id).toBe("mbid-123");
    });

    it("returns error on API failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
      });

      const { searchArtistHandler } = await import(
        "../src/servers/musicbrainz.js"
      );
      const result = await searchArtistHandler({ query: "test" });

      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBeDefined();
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/musicbrainz.test.ts`
Expected: FAIL — module not found.

**Step 3: Write the implementation**

```typescript
// src/servers/musicbrainz.ts
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const BASE_URL = "https://musicbrainz.org/ws/2";
const USER_AGENT = "Crate/0.1.0 (https://github.com/user/crate-cli)";
const RATE_LIMIT_MS = 1100;

let lastRequest = 0;

export async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequest;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
  lastRequest = Date.now();
}

async function mbFetch(path: string): Promise<any> {
  await rateLimit();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`MusicBrainz API error: ${res.status}`);
  }
  return res.json();
}

function toolResult(data: unknown): { content: [{ type: "text"; text: string }] } {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(error: unknown): { content: [{ type: "text"; text: string }] } {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }] };
}

// --- Handler functions (exported for testing) ---

export async function searchArtistHandler(args: { query: string }) {
  try {
    const data = await mbFetch(
      `/artist?query=${encodeURIComponent(args.query)}&fmt=json&limit=10`,
    );
    return toolResult(data.artists);
  } catch (error) {
    return toolError(error);
  }
}

export async function getArtistHandler(args: { mbid: string }) {
  try {
    const data = await mbFetch(
      `/artist/${args.mbid}?fmt=json&inc=artist-rels+url-rels+release-groups`,
    );
    return toolResult(data);
  } catch (error) {
    return toolError(error);
  }
}

export async function searchReleaseHandler(args: {
  query: string;
  artist?: string;
}) {
  try {
    let q = args.query;
    if (args.artist) q += ` AND artist:${args.artist}`;
    const data = await mbFetch(
      `/release?query=${encodeURIComponent(q)}&fmt=json&limit=10`,
    );
    return toolResult(data.releases);
  } catch (error) {
    return toolError(error);
  }
}

export async function getReleaseHandler(args: { mbid: string }) {
  try {
    const data = await mbFetch(
      `/release/${args.mbid}?fmt=json&inc=recordings+artist-credits+labels`,
    );
    return toolResult(data);
  } catch (error) {
    return toolError(error);
  }
}

export async function searchRecordingHandler(args: {
  query: string;
  artist?: string;
}) {
  try {
    let q = args.query;
    if (args.artist) q += ` AND artist:${args.artist}`;
    const data = await mbFetch(
      `/recording?query=${encodeURIComponent(q)}&fmt=json&limit=10`,
    );
    return toolResult(data.recordings);
  } catch (error) {
    return toolError(error);
  }
}

export async function getRecordingCreditsHandler(args: { mbid: string }) {
  try {
    const data = await mbFetch(
      `/recording/${args.mbid}?fmt=json&inc=artist-credits+artist-rels+work-rels`,
    );
    return toolResult(data);
  } catch (error) {
    return toolError(error);
  }
}

// --- Tool definitions ---

const searchArtist = tool(
  "search_artist",
  "Search MusicBrainz for artists by name. Returns a ranked list of matching artists with IDs, disambiguation, type, and country.",
  { query: z.string().describe("Artist name to search for") },
  searchArtistHandler,
);

const getArtist = tool(
  "get_artist",
  "Get full artist details from MusicBrainz by MBID. Includes relationships (collaborations, member-of, URLs) and release groups (albums, singles, EPs).",
  { mbid: z.string().describe("MusicBrainz artist ID (UUID format)") },
  getArtistHandler,
);

const searchRelease = tool(
  "search_release",
  "Search MusicBrainz for releases (albums, singles, EPs). Optionally filter by artist name.",
  {
    query: z.string().describe("Release title to search for"),
    artist: z
      .string()
      .optional()
      .describe("Filter by artist name"),
  },
  searchReleaseHandler,
);

const getRelease = tool(
  "get_release",
  "Get full release details from MusicBrainz by MBID. Includes tracklist with recordings, artist credits, and label information.",
  { mbid: z.string().describe("MusicBrainz release ID (UUID format)") },
  getReleaseHandler,
);

const searchRecording = tool(
  "search_recording",
  "Search MusicBrainz for recordings (individual tracks). Optionally filter by artist name.",
  {
    query: z.string().describe("Recording/track title to search for"),
    artist: z
      .string()
      .optional()
      .describe("Filter by artist name"),
  },
  searchRecordingHandler,
);

const getRecordingCredits = tool(
  "get_recording_credits",
  "Get detailed credits for a recording from MusicBrainz by MBID. Includes artist credits, artist relationships (producer, engineer, etc.), and work relationships.",
  {
    mbid: z.string().describe("MusicBrainz recording ID (UUID format)"),
  },
  getRecordingCreditsHandler,
);

// --- Server export ---

export const musicbrainzServer = createSdkMcpServer({
  name: "musicbrainz",
  version: "1.0.0",
  tools: [
    searchArtist,
    getArtist,
    searchRelease,
    getRelease,
    searchRecording,
    getRecordingCredits,
  ],
});
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/musicbrainz.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/servers/musicbrainz.ts tests/musicbrainz.test.ts
git commit -m "feat: add MusicBrainz MCP server with 6 tools and rate limiting"
```

---

### Task 4: MusicBrainz Remaining Tool Tests

**Files:**
- Modify: `tests/musicbrainz.test.ts`

**Step 1: Add tests for remaining handlers**

Add these test cases to `tests/musicbrainz.test.ts`:

```typescript
describe("getArtistHandler", () => {
  it("fetches artist with relationships and release groups", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "mbid-123",
        name: "Madlib",
        type: "Person",
        relations: [{ type: "member of band", target: { name: "Madvillain" } }],
        "release-groups": [{ title: "Madvillainy", "primary-type": "Album" }],
      }),
    });

    const { getArtistHandler } = await import("../src/servers/musicbrainz.js");
    const result = await getArtistHandler({ mbid: "mbid-123" });
    const data = JSON.parse(result.content[0].text);
    expect(data.name).toBe("Madlib");
    expect(data.relations).toBeDefined();
  });
});

describe("searchReleaseHandler", () => {
  it("searches releases with optional artist filter", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        releases: [{ id: "rel-1", title: "Madvillainy", status: "Official" }],
      }),
    });

    const { searchReleaseHandler } = await import("../src/servers/musicbrainz.js");
    const result = await searchReleaseHandler({
      query: "Madvillainy",
      artist: "Madvillain",
    });
    const data = JSON.parse(result.content[0].text);
    expect(data[0].title).toBe("Madvillainy");
  });
});

describe("getReleaseHandler", () => {
  it("fetches release with tracklist and credits", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "rel-1",
        title: "Madvillainy",
        media: [{ tracks: [{ title: "Accordion", position: 1 }] }],
      }),
    });

    const { getReleaseHandler } = await import("../src/servers/musicbrainz.js");
    const result = await getReleaseHandler({ mbid: "rel-1" });
    const data = JSON.parse(result.content[0].text);
    expect(data.title).toBe("Madvillainy");
    expect(data.media[0].tracks[0].title).toBe("Accordion");
  });
});

describe("searchRecordingHandler", () => {
  it("searches recordings with optional artist filter", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        recordings: [{ id: "rec-1", title: "Accordion", score: 100 }],
      }),
    });

    const { searchRecordingHandler } = await import("../src/servers/musicbrainz.js");
    const result = await searchRecordingHandler({
      query: "Accordion",
      artist: "Madvillain",
    });
    const data = JSON.parse(result.content[0].text);
    expect(data[0].title).toBe("Accordion");
  });
});

describe("getRecordingCreditsHandler", () => {
  it("fetches recording with artist credits and relationships", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "rec-1",
        title: "Accordion",
        "artist-credit": [{ artist: { name: "Madvillain" } }],
        relations: [{ type: "producer", artist: { name: "Madlib" } }],
      }),
    });

    const { getRecordingCreditsHandler } = await import(
      "../src/servers/musicbrainz.js"
    );
    const result = await getRecordingCreditsHandler({ mbid: "rec-1" });
    const data = JSON.parse(result.content[0].text);
    expect(data.title).toBe("Accordion");
    expect(data.relations[0].type).toBe("producer");
  });
});
```

**Step 2: Run all tests**

Run: `npx vitest run tests/musicbrainz.test.ts`
Expected: All tests PASS (the handlers already exist from Task 3).

**Step 3: Commit**

```bash
git add tests/musicbrainz.test.ts
git commit -m "test: add tests for all MusicBrainz tool handlers"
```

---

### Task 5: Server Registry

**Files:**
- Create: `src/servers/index.ts`
- Test: `tests/server-registry.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/server-registry.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("server registry", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("always includes musicbrainz server", async () => {
    const { getActiveServers } = await import("../src/servers/index.js");
    const servers = getActiveServers();
    expect(servers).toHaveProperty("musicbrainz");
  });

  it("generates wildcard allowed tools for each server", async () => {
    const { getActiveServers, getAllowedTools } = await import(
      "../src/servers/index.js"
    );
    const servers = getActiveServers();
    const tools = getAllowedTools(servers);
    expect(tools).toContain("mcp__musicbrainz__*");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/server-registry.test.ts`
Expected: FAIL — module not found.

**Step 3: Write the implementation**

```typescript
// src/servers/index.ts
import { musicbrainzServer } from "./musicbrainz.js";

export function getActiveServers(): Record<string, any> {
  const servers: Record<string, any> = {
    musicbrainz: musicbrainzServer,
  };

  // Future key-gated servers:
  // if (process.env.DISCOGS_TOKEN) servers.discogs = discogsServer;
  // if (process.env.MEM0_API_KEY) servers.memory = memoryServer;
  // if (process.env.LASTFM_API_KEY) servers.lastfm = lastfmServer;
  // if (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET)
  //   servers.spotify = spotifyServer;
  // if (process.env.GENIUS_ACCESS_TOKEN) servers.genius = geniusServer;
  // if (process.env.TICKETMASTER_API_KEY) servers.events = eventsServer;
  // if (process.env.WIKIPEDIA_ACCESS_TOKEN) servers.wikipedia = wikipediaServer;

  return servers;
}

export function getAllowedTools(servers: Record<string, any>): string[] {
  return Object.keys(servers).map((name) => `mcp__${name}__*`);
}

export function getServerStatus(): { active: string[]; inactive: string[] } {
  const active = Object.keys(getActiveServers());
  const allServers = [
    "musicbrainz",
    "discogs",
    "memory",
    "lastfm",
    "spotify",
    "genius",
    "events",
    "wikipedia",
  ];
  const inactive = allServers.filter((s) => !active.includes(s));
  return { active, inactive };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/server-registry.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/servers/index.ts tests/server-registry.test.ts
git commit -m "feat: add server registry with key-gating and status reporting"
```

---

### Task 6: System Prompt + CrateAgent

**Files:**
- Create: `src/agent/system-prompt.ts`
- Create: `src/agent/index.ts`
- Test: `tests/agent.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/agent.test.ts
import { describe, it, expect, vi } from "vitest";

// Mock the SDK — we can't spawn subprocesses in tests
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
  tool: vi.fn(),
  createSdkMcpServer: vi.fn(() => ({ type: "sdk" })),
}));

describe("CrateAgent", () => {
  it("defaults to sonnet model", async () => {
    const { CrateAgent } = await import("../src/agent/index.js");
    const agent = new CrateAgent();
    expect(agent.activeModel).toBe("claude-sonnet-4-6");
  });

  it("accepts a model in constructor", async () => {
    const { CrateAgent } = await import("../src/agent/index.js");
    const agent = new CrateAgent("claude-opus-4-6");
    expect(agent.activeModel).toBe("claude-opus-4-6");
  });

  it("switches model by alias", async () => {
    const { CrateAgent } = await import("../src/agent/index.js");
    const agent = new CrateAgent();
    const resolved = agent.switchModel("opus");
    expect(resolved).toBe("claude-opus-4-6");
    expect(agent.activeModel).toBe("claude-opus-4-6");
  });

  it("switches model by full string", async () => {
    const { CrateAgent } = await import("../src/agent/index.js");
    const agent = new CrateAgent();
    const resolved = agent.switchModel("claude-haiku-4-5-20251001");
    expect(resolved).toBe("claude-haiku-4-5-20251001");
  });
});

describe("system prompt", () => {
  it("returns a non-empty string", async () => {
    const { getSystemPrompt } = await import("../src/agent/system-prompt.js");
    const prompt = getSystemPrompt();
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(100);
  });

  it("mentions MusicBrainz capabilities", async () => {
    const { getSystemPrompt } = await import("../src/agent/system-prompt.js");
    const prompt = getSystemPrompt();
    expect(prompt).toContain("MusicBrainz");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/agent.test.ts`
Expected: FAIL — modules not found.

**Step 3: Write the system prompt**

```typescript
// src/agent/system-prompt.ts

export function getSystemPrompt(): string {
  return `You are Crate, an expert music research agent. You help DJs, record collectors, music journalists, and serious listeners research music in depth.

You run in a terminal and communicate using markdown formatting.

## Your data sources

### MusicBrainz (always available, no API key)
The canonical open music database. Use these tools for:
- **search_artist** — Find artists by name. Returns ranked matches with MBIDs.
- **get_artist** — Get full artist details by MBID: relationships (collaborations, band memberships, URLs), and release groups (albums, singles, EPs).
- **search_release** — Find releases (albums, singles, EPs) by title, optionally filtered by artist.
- **get_release** — Get full release details by MBID: tracklist with recordings, artist credits, label info.
- **search_recording** — Find individual tracks by title, optionally filtered by artist.
- **get_recording_credits** — Get detailed credits for a recording by MBID: artist credits, producer/engineer relationships, work relationships.

## Research methodology
1. **Search first, then drill down.** Use search tools to find the right entity, then use get tools with the MBID for full details.
2. **Cross-reference IDs.** MusicBrainz IDs (MBIDs) link artists, releases, and recordings. Use them to build complete pictures.
3. **Be thorough on credits.** For production/writing questions, get recording-level credits — album-level credits often miss per-track details.
4. **Offer to go deeper.** When results are interesting, offer to explore relationships, discographies, or related artists.

## Response style
- Be concise but thorough — no filler
- Use markdown headers, lists, and tables for structure
- Bold important names, dates, and facts
- If a search returns no results, suggest alternative spellings or related terms
- When presenting discographies, use tables with year, title, and format columns`;
}
```

**Step 4: Write the CrateAgent class**

```typescript
// src/agent/index.ts
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { getActiveServers, getAllowedTools } from "../servers/index.js";
import { getSystemPrompt } from "./system-prompt.js";
import { resolveModel } from "../utils/config.js";

const DEFAULT_MODEL = "claude-sonnet-4-6";

export class CrateAgent {
  private model: string;
  private sessionId?: string;
  private servers: Record<string, any>;
  private totalCostUsd = 0;

  constructor(model?: string) {
    this.model = model ?? DEFAULT_MODEL;
    this.servers = getActiveServers();
  }

  get activeModel(): string {
    return this.model;
  }

  get cost(): number {
    return this.totalCostUsd;
  }

  switchModel(alias: string): string {
    const resolved = resolveModel(alias);
    this.model = resolved;
    return resolved;
  }

  async *chat(userMessage: string): AsyncGenerator<SDKMessage> {
    const stream = query({
      prompt: userMessage,
      options: {
        model: this.model,
        systemPrompt: getSystemPrompt(),
        mcpServers: this.servers,
        allowedTools: getAllowedTools(this.servers),
        resume: this.sessionId,
        maxTurns: 25,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
      },
    });

    for await (const message of stream) {
      if (
        message.type === "system" &&
        (message as any).subtype === "init"
      ) {
        this.sessionId = (message as any).session_id;
      }
      if (
        message.type === "result" &&
        (message as any).subtype === "success"
      ) {
        this.totalCostUsd += (message as any).total_cost_usd ?? 0;
      }
      yield message;
    }
  }
}
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/agent.test.ts`
Expected: All tests PASS.

**Step 6: Commit**

```bash
git add src/agent/system-prompt.ts src/agent/index.ts tests/agent.test.ts
git commit -m "feat: add CrateAgent class and system prompt for MusicBrainz research"
```

---

### Task 7: UI Themes and Components

**Files:**
- Create: `src/ui/components.ts`

No automated tests for this task — themes are visual. We'll verify in the integration test (Task 9).

**Step 1: Create theme definitions and helpers**

```typescript
// src/ui/components.ts
import chalk from "chalk";
import type { MarkdownTheme, EditorTheme } from "@mariozechner/pi-tui";

export const markdownTheme: MarkdownTheme = {
  heading: (s: string) => chalk.bold.cyan(s),
  link: (s: string) => chalk.blue(s),
  linkUrl: (s: string) => chalk.dim(s),
  code: (s: string) => chalk.yellow(s),
  codeBlock: (s: string) => chalk.gray(s),
  codeBlockBorder: (s: string) => chalk.dim(s),
  quote: (s: string) => chalk.italic.dim(s),
  quoteBorder: (s: string) => chalk.dim(s),
  hr: (s: string) => chalk.dim(s),
  listBullet: (s: string) => chalk.cyan(s),
  bold: (s: string) => chalk.bold(s),
  italic: (s: string) => chalk.italic(s),
  strikethrough: (s: string) => chalk.strikethrough(s),
  underline: (s: string) => chalk.underline(s),
};

export const editorTheme: EditorTheme = {
  borderColor: (s: string) => chalk.dim(s),
  selectList: {
    selectedPrefix: (s: string) => chalk.cyan(s),
    selectedText: (s: string) => chalk.white(s),
    description: (s: string) => chalk.dim(s),
    scrollInfo: (s: string) => chalk.dim(s),
    noMatch: (s: string) => chalk.dim(s),
  },
};

export const WELCOME_TEXT = `${chalk.bold.cyan("Crate")} ${chalk.dim("v0.1.0")} — Music research agent

${chalk.dim("Type a question to start researching. Use /help for commands.")}
${chalk.dim("Press Enter to send, Escape to cancel.")}`;

export const HELP_TEXT = `${chalk.bold.cyan("Commands")}

${chalk.bold("Research")}
  ${chalk.dim("Just type naturally — ask about artists, albums, credits, scenes.")}

${chalk.bold("Session")}
  ${chalk.cyan("/model")}${chalk.dim(" [name]")}  Show or switch model (sonnet, opus, haiku)
  ${chalk.cyan("/cost")}           Show token usage and cost
  ${chalk.cyan("/clear")}          Clear the screen
  ${chalk.cyan("/help")}           Show this help
  ${chalk.cyan("/quit")}           Exit Crate`;
```

**Step 2: Commit**

```bash
git add src/ui/components.ts
git commit -m "feat: add UI themes for markdown rendering and editor"
```

---

### Task 8: App TUI Setup

**Files:**
- Create: `src/ui/app.ts`

**Step 1: Write the TUI application**

```typescript
// src/ui/app.ts
import {
  TUI,
  ProcessTerminal,
  Editor,
  Markdown,
  Loader,
  Text,
  CombinedAutocompleteProvider,
} from "@mariozechner/pi-tui";
import type { SlashCommand } from "@mariozechner/pi-tui";
import chalk from "chalk";
import { CrateAgent } from "../agent/index.js";
import { markdownTheme, editorTheme, WELCOME_TEXT, HELP_TEXT } from "./components.js";
import { getServerStatus } from "../servers/index.js";

function addChildBeforeEditor(tui: TUI, child: any): void {
  const children = tui.children;
  children.splice(children.length - 1, 0, child);
}

function handleSlashCommand(tui: TUI, agent: CrateAgent, input: string): void {
  const parts = input.slice(1).split(/\s+/);
  const command = parts[0]?.toLowerCase();
  const arg = parts[1];

  switch (command) {
    case "help": {
      addChildBeforeEditor(tui, new Text(HELP_TEXT, 1, 1));
      tui.requestRender();
      break;
    }
    case "model": {
      if (arg) {
        const resolved = agent.switchModel(arg);
        addChildBeforeEditor(
          tui,
          new Text(chalk.dim(`Switched to ${chalk.cyan(resolved)}`), 1, 0),
        );
      } else {
        addChildBeforeEditor(
          tui,
          new Text(
            chalk.dim(`Active model: ${chalk.cyan(agent.activeModel)}`),
            1,
            0,
          ),
        );
      }
      tui.requestRender();
      break;
    }
    case "cost": {
      const cost = agent.cost;
      addChildBeforeEditor(
        tui,
        new Text(chalk.dim(`Session cost: ${chalk.cyan(`$${cost.toFixed(4)}`)}`), 1, 0),
      );
      tui.requestRender();
      break;
    }
    case "clear": {
      // Keep only the editor (last child)
      const editor = tui.children[tui.children.length - 1];
      tui.clear();
      tui.addChild(editor!);
      tui.requestRender(true);
      break;
    }
    case "servers": {
      const status = getServerStatus();
      const lines = [
        chalk.bold("Active servers:"),
        ...status.active.map((s) => `  ${chalk.green("●")} ${s}`),
        "",
        chalk.bold("Inactive servers") + chalk.dim(" (missing API keys):"),
        ...status.inactive.map((s) => `  ${chalk.dim("○")} ${s}`),
      ];
      addChildBeforeEditor(tui, new Text(lines.join("\n"), 1, 1));
      tui.requestRender();
      break;
    }
    case "quit":
    case "exit": {
      tui.stop();
      process.exit(0);
    }
    default: {
      addChildBeforeEditor(
        tui,
        new Text(
          chalk.yellow(`Unknown command: /${command}. Type /help for available commands.`),
          1,
          0,
        ),
      );
      tui.requestRender();
    }
  }
}

export function createApp(agent: CrateAgent): TUI {
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);

  // Welcome message
  tui.addChild(new Text(WELCOME_TEXT, 1, 1));

  // Slash command autocomplete
  const slashCommands: SlashCommand[] = [
    { name: "help", description: "Show available commands" },
    { name: "model", description: "Show or switch model (sonnet, opus, haiku)" },
    { name: "cost", description: "Show token usage and cost" },
    { name: "clear", description: "Clear the screen" },
    { name: "servers", description: "Show active/inactive servers" },
    { name: "quit", description: "Exit Crate" },
  ];

  const autocomplete = new CombinedAutocompleteProvider(slashCommands, process.cwd());

  const editor = new Editor(tui, editorTheme);
  editor.setAutocompleteProvider(autocomplete);

  let isProcessing = false;

  editor.onSubmit = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isProcessing) return;

    // Handle slash commands locally
    if (trimmed.startsWith("/")) {
      handleSlashCommand(tui, agent, trimmed);
      return;
    }

    isProcessing = true;
    editor.disableSubmit = true;

    // Show user message
    addChildBeforeEditor(
      tui,
      new Text(chalk.bold.white("> ") + trimmed, 1, 0),
    );

    // Show loader while agent works
    const loader = new Loader(
      tui,
      (s: string) => chalk.cyan(s),
      (s: string) => chalk.dim(s),
      "Researching...",
    );
    addChildBeforeEditor(tui, loader);
    tui.requestRender();

    // Stream agent response
    const response = new Markdown("", 1, 1, markdownTheme);
    let accumulated = "";
    let loaderRemoved = false;

    try {
      for await (const msg of agent.chat(trimmed)) {
        if (msg.type === "assistant") {
          const content = (msg as any).message?.content;
          if (!content) continue;

          for (const block of content) {
            if (block.type === "text" && block.text) {
              if (!loaderRemoved) {
                tui.removeChild(loader);
                addChildBeforeEditor(tui, response);
                loaderRemoved = true;
              }
              accumulated += block.text;
              response.setText(accumulated);
              tui.requestRender();
            }
          }
        }
      }
    } catch (error) {
      if (!loaderRemoved) {
        tui.removeChild(loader);
      }
      const message =
        error instanceof Error ? error.message : "An unexpected error occurred";
      addChildBeforeEditor(
        tui,
        new Text(chalk.red(`Error: ${message}`), 1, 0),
      );
    }

    if (!loaderRemoved) {
      tui.removeChild(loader);
    }

    isProcessing = false;
    editor.disableSubmit = false;
    tui.requestRender();
  };

  tui.addChild(editor);
  tui.setFocus(editor);

  return tui;
}
```

**Step 2: Commit**

```bash
git add src/ui/app.ts
git commit -m "feat: add pi-tui app with streaming agent responses and slash commands"
```

---

### Task 9: CLI Entry Point

**Files:**
- Create: `src/cli.ts`

**Step 1: Write the entry point with arg parsing**

```typescript
// src/cli.ts
import "dotenv/config";
import { CrateAgent } from "./agent/index.js";
import { createApp } from "./ui/app.js";
import { resolveModel } from "./utils/config.js";

function parseArgs(args: string[]): { model?: string; help?: boolean } {
  const result: { model?: string; help?: boolean } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--model" || arg === "-m") {
      const next = args[i + 1];
      if (next) {
        result.model = resolveModel(next);
        i++;
      }
    } else if (arg === "--help" || arg === "-h") {
      result.help = true;
    }
  }

  return result;
}

function printUsage(): void {
  console.log(`
crate — AI-powered music research agent

Usage:
  crate                          Start interactive research session
  crate --model <name>           Start with a specific model

Models:
  sonnet (default)               Everyday research
  opus                           Deep research sessions
  haiku                          Quick lookups

Options:
  --model, -m <name>             Set the Claude model
  --help, -h                     Show this help
`);
}

function main(): void {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.help) {
    printUsage();
    process.exit(0);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "Error: ANTHROPIC_API_KEY is required. Set it in your environment or .env file.",
    );
    process.exit(1);
  }

  const agent = new CrateAgent(parsed.model);
  const app = createApp(agent);
  app.start();
}

main();
```

**Step 2: Verify the app starts**

Run: `npm run dev -- --help`
Expected: Prints usage text and exits cleanly.

**Step 3: Commit**

```bash
git add src/cli.ts
git commit -m "feat: add CLI entry point with arg parsing and model selection"
```

---

### Task 10: End-to-End Verification

**Files:** None — manual testing.

**Step 1: Run all unit tests**

Run: `npm test`
Expected: All tests pass.

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No type errors. If there are type errors from the SDK or pi-tui types, fix them.

**Step 3: Test the REPL**

Run: `npm run dev`

Expected behavior:
1. Welcome message appears with "Crate v0.1.0"
2. Editor is focused, cursor visible
3. Type `/help` — shows command list
4. Type `/model` — shows "Active model: claude-sonnet-4-6"
5. Type `/servers` — shows musicbrainz as active, others as inactive
6. Type "Who is Madlib?" — loader appears, then streamed Markdown response from agent using MusicBrainz tools
7. Type `/cost` — shows session cost
8. Type `/quit` — clean exit

**Step 4: Fix any issues found during manual testing**

Address any rendering bugs, streaming issues, or error handling gaps.

**Step 5: Final commit**

```bash
git add -A
git commit -m "chore: fix issues found during end-to-end testing"
```

Only commit if there were fixes. If everything worked, skip this step.

---

## Summary

| Task | Description | Files | Tests |
|------|-------------|-------|-------|
| 1 | Project init | package.json, tsconfig, .gitignore, .env.example | - |
| 2 | Config utility | src/utils/config.ts | tests/config.test.ts |
| 3 | MusicBrainz server | src/servers/musicbrainz.ts | tests/musicbrainz.test.ts |
| 4 | MusicBrainz test coverage | - | tests/musicbrainz.test.ts |
| 5 | Server registry | src/servers/index.ts | tests/server-registry.test.ts |
| 6 | System prompt + CrateAgent | src/agent/*.ts | tests/agent.test.ts |
| 7 | UI themes | src/ui/components.ts | - |
| 8 | App TUI | src/ui/app.ts | - |
| 9 | CLI entry point | src/cli.ts | - |
| 10 | End-to-end verification | - | manual |

After completion: the full vertical slice is working. Next features (more MCP servers, audio player, memory, collection) layer onto this foundation.
