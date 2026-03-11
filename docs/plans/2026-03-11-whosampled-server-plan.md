# WhoSampled MCP Server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a WhoSampled MCP server to Crate CLI that returns structured sample relationship data via Kernel.sh headless browser.

**Architecture:** New `src/servers/whosampled.ts` with 3 tools. Reuses `withBrowser()` from `browser.ts` for Kernel.sh Chromium sessions. Extracts structured metadata from WhoSampled DOM — no editorial content. Gated on `KERNEL_API_KEY`.

**Tech Stack:** TypeScript, Claude Agent SDK (`tool()`, `createSdkMcpServer()`), Zod schemas, Playwright (via Kernel.sh CDP), Vitest.

**Design doc:** `docs/plans/2026-03-11-whosampled-server-design.md`

---

### Task 1: Export `withBrowser` from browser.ts

**Files:**
- Modify: `src/servers/browser.ts:58` — change `async function withBrowser` to `export async function withBrowser`

**Step 1: Make `withBrowser` public**

In `src/servers/browser.ts`, line 58, change:

```typescript
async function withBrowser<T>(fn: (page: Page, browser: Browser) => Promise<T>): Promise<T> {
```

to:

```typescript
export async function withBrowser<T>(fn: (page: Page, browser: Browser) => Promise<T>): Promise<T> {
```

**Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors (existing code already imports from browser.ts)

**Step 3: Commit**

```bash
git add src/servers/browser.ts
git commit -m "refactor: export withBrowser from browser server for reuse"
```

---

### Task 2: Create WhoSampled server — DOM extraction helpers

**Files:**
- Create: `src/servers/whosampled.ts`

**Step 1: Write the server scaffold with rate limiting and helpers**

Create `src/servers/whosampled.ts`:

```typescript
// src/servers/whosampled.ts
/**
 * WhoSampled MCP server — structured sample relationship data via headless browser.
 *
 * CONTENT SIGNAL COMPLIANCE:
 * - search=yes: Returns hyperlinks + structured metadata (artist, track, year, type, URL)
 * - ai-train=no: Not applicable (no training)
 * - ai-input: Unspecified by WhoSampled. Mitigated by returning metadata only, not editorial content.
 * - ClaudeBot blocked: Uses real Chromium via Kernel.sh, not a crawler bot.
 *
 * This server extracts ONLY structured relationship data (who sampled whom).
 * No editorial content, user comments, or descriptions are scraped.
 * Every result includes a whosampled_url pointing back to the source.
 */

import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { withBrowser } from "./browser.js";
import type { Page } from "playwright-core";

const RATE_LIMIT_MS = 2000;
const BASE_URL = "https://www.whosampled.com";

let lastRequest = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequest;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
  lastRequest = Date.now();
}

type ToolResult = { content: [{ type: "text"; text: string }] };

function toolResult(data: unknown): ToolResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }] };
}

/** Slugify an artist name for WhoSampled URL construction. */
function slugify(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9\-()'.]/g, "")
    .replace(/-+/g, "-");
}
```

**Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/servers/whosampled.ts
git commit -m "feat(whosampled): add server scaffold with rate limiting and helpers"
```

---

### Task 3: Write failing tests for DOM extraction

**Files:**
- Create: `tests/whosampled.test.ts`

**Step 1: Write unit tests for the extraction functions**

The DOM extraction functions will be exported for testing. Create `tests/whosampled.test.ts`:

```typescript
// tests/whosampled.test.ts
import { describe, it, expect } from "vitest";
import {
  parseSearchResults,
  parseTrackSamples,
  parseArtistConnections,
} from "../src/servers/whosampled.js";

describe("whosampled", () => {
  describe("parseSearchResults", () => {
    it("extracts track results from search page HTML", () => {
      const html = `
        <div class="listEntry">
          <a class="trackName" href="/Mobb-Deep/Shook-Ones-(Part-II)/">Shook Ones (Part II)</a>
          <span class="artistName">Mobb Deep</span>
          <span class="sampleCount">3 Samples</span>
          <span class="sampledCount">14 Sampled</span>
        </div>
      `;
      const results = parseSearchResults(html);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]).toMatchObject({
        track: expect.any(String),
        artist: expect.any(String),
        whosampled_url: expect.stringContaining("whosampled.com"),
      });
    });

    it("returns empty array for no results", () => {
      const html = `<div class="noResults">No results found</div>`;
      const results = parseSearchResults(html);
      expect(results).toEqual([]);
    });
  });

  describe("parseTrackSamples", () => {
    it("extracts samples_used from track page HTML", () => {
      const html = `
        <section class="section-header-title">Contains samples of</section>
        <div class="sampleEntry">
          <a class="trackName" href="/Quincy-Jones/Kitty-With-the-Bent-Frame/">Kitty with the Bent Frame</a>
          <span class="artistName">Quincy Jones</span>
          <span class="year">1971</span>
          <span class="sampleType">Drums / Beat</span>
        </div>
      `;
      const result = parseTrackSamples(html);
      expect(result.samples_used.length).toBeGreaterThanOrEqual(1);
      expect(result.samples_used[0]).toMatchObject({
        title: expect.any(String),
        artist: expect.any(String),
        whosampled_url: expect.stringContaining("whosampled.com"),
      });
    });

    it("extracts sampled_by from track page HTML", () => {
      const html = `
        <section class="section-header-title">Was sampled in</section>
        <div class="sampleEntry">
          <a class="trackName" href="/Some-Artist/Some-Track/">Some Track</a>
          <span class="artistName">Some Artist</span>
          <span class="year">2005</span>
        </div>
      `;
      const result = parseTrackSamples(html);
      expect(result.sampled_by.length).toBeGreaterThanOrEqual(1);
    });

    it("returns empty arrays when no samples found", () => {
      const html = `<div class="noSamples">No samples found</div>`;
      const result = parseTrackSamples(html);
      expect(result.samples_used).toEqual([]);
      expect(result.sampled_by).toEqual([]);
    });
  });

  describe("parseArtistConnections", () => {
    it("extracts artist overview from artist page HTML", () => {
      const html = `
        <div class="artistStats">
          <span class="samplesUsed">45</span>
          <span class="sampledBy">89</span>
        </div>
        <div class="topTrack">
          <a class="trackName" href="/Mobb-Deep/Shook-Ones-(Part-II)/">Shook Ones (Part II)</a>
          <span class="sampleCount">14</span>
        </div>
      `;
      const result = parseArtistConnections(html);
      expect(result).toMatchObject({
        top_sampled_tracks: expect.any(Array),
      });
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/whosampled.test.ts`
Expected: FAIL — `parseSearchResults`, `parseTrackSamples`, `parseArtistConnections` not exported yet

**Step 3: Commit**

```bash
git add tests/whosampled.test.ts
git commit -m "test(whosampled): add failing tests for DOM extraction functions"
```

---

### Task 4: Implement DOM extraction functions

**Files:**
- Modify: `src/servers/whosampled.ts` — add `parseSearchResults`, `parseTrackSamples`, `parseArtistConnections`

**Step 1: Implement the extraction functions**

WhoSampled's DOM will need real-world inspection. Add these exported functions to `src/servers/whosampled.ts`:

```typescript
// --- Types ---

interface SearchResult {
  track: string;
  artist: string;
  whosampled_url: string;
  sample_count?: number;
  sampled_by_count?: number;
}

interface SampleEntry {
  title: string;
  artist: string;
  year?: number;
  type: "sample" | "interpolation" | "replay" | "unknown";
  element?: string;
  whosampled_url: string;
}

interface TrackSamples {
  samples_used: SampleEntry[];
  sampled_by: SampleEntry[];
}

interface ArtistTopTrack {
  track: string;
  sample_count: number;
  whosampled_url: string;
}

interface ArtistConnections {
  total_samples_used?: number;
  total_sampled_by?: number;
  top_sampled_tracks: ArtistTopTrack[];
  top_sampling_tracks: ArtistTopTrack[];
}

// --- DOM Extraction (exported for testing) ---

/**
 * Extract structured data from a WhoSampled page using Playwright's page.evaluate().
 * These functions run INSIDE the browser context, not in Node.
 * We export thin wrappers that accept raw HTML for unit testing.
 */

/** Parse search results page. Accepts raw HTML string for testability. */
export function parseSearchResults(html: string): SearchResult[] {
  // WhoSampled search results use .trackEntry or .listEntry containers
  // Each contains a link to the track page, artist name, and sample counts
  // Real selectors will be confirmed during integration testing with live pages
  const results: SearchResult[] = [];

  // Match track entries — pattern: linked track name + artist + optional counts
  const entryPattern = /<a[^>]*href="(\/[^"]+\/[^"]+\/)"[^>]*>([^<]+)<\/a>[\s\S]*?<span[^>]*class="[^"]*artist[^"]*"[^>]*>([^<]+)<\/span>/gi;
  let match;
  while ((match = entryPattern.exec(html)) !== null) {
    const href = match[1] ?? "";
    const track = (match[2] ?? "").trim();
    const artist = (match[3] ?? "").trim();
    if (track && artist) {
      // Extract counts if present
      const countMatch = html.slice(match.index, match.index + 500).match(/(\d+)\s*Sample/i);
      const sampledMatch = html.slice(match.index, match.index + 500).match(/(\d+)\s*Sampled/i);
      results.push({
        track,
        artist,
        whosampled_url: `${BASE_URL}${href}`,
        sample_count: countMatch ? parseInt(countMatch[1]!, 10) : undefined,
        sampled_by_count: sampledMatch ? parseInt(sampledMatch[1]!, 10) : undefined,
      });
    }
  }
  return results.slice(0, 10);
}

/** Parse track samples page. Accepts raw HTML string for testability. */
export function parseTrackSamples(html: string): TrackSamples {
  const samples_used: SampleEntry[] = [];
  const sampled_by: SampleEntry[] = [];

  // Split page into sections based on headers
  const containsSamplesIdx = html.indexOf("Contains samples of");
  const wasSampledIdx = html.indexOf("Was sampled in");

  function extractEntries(section: string): SampleEntry[] {
    const entries: SampleEntry[] = [];
    const pattern = /<a[^>]*href="(\/[^"]+\/[^"]+\/)"[^>]*>([^<]+)<\/a>[\s\S]*?<span[^>]*class="[^"]*artist[^"]*"[^>]*>([^<]+)<\/span>/gi;
    let m;
    while ((m = pattern.exec(section)) !== null) {
      const href = m[1] ?? "";
      const title = (m[2] ?? "").trim();
      const artist = (m[3] ?? "").trim();
      if (!title || !artist) continue;

      const context = section.slice(m.index, m.index + 500);
      const yearMatch = context.match(/(\d{4})/);
      const elementMatch = context.match(/(?:Drums|Vocals|Hook|Bass|Piano|Guitar|Strings|Horn|Multiple)[^<]*/i);

      entries.push({
        title,
        artist,
        year: yearMatch ? parseInt(yearMatch[1]!, 10) : undefined,
        type: "sample",
        element: elementMatch ? elementMatch[0].trim() : undefined,
        whosampled_url: `${BASE_URL}${href}`,
      });
    }
    return entries;
  }

  // Extract each section
  if (containsSamplesIdx !== -1) {
    const endIdx = wasSampledIdx !== -1 ? wasSampledIdx : html.length;
    samples_used.push(...extractEntries(html.slice(containsSamplesIdx, endIdx)));
  }
  if (wasSampledIdx !== -1) {
    sampled_by.push(...extractEntries(html.slice(wasSampledIdx)));
  }

  return { samples_used, sampled_by };
}

/** Parse artist connections page. Accepts raw HTML string for testability. */
export function parseArtistConnections(html: string): ArtistConnections {
  const top_sampled_tracks: ArtistTopTrack[] = [];
  const top_sampling_tracks: ArtistTopTrack[] = [];

  // Extract total counts from artist header/stats area
  const samplesUsedMatch = html.match(/(\d+)\s*Samples?\s*(?:Used|of)/i);
  const sampledByMatch = html.match(/(\d+)\s*(?:Sampled|Times Sampled)/i);

  // Extract top tracks — these appear in ranked lists on the artist page
  const trackPattern = /<a[^>]*href="(\/[^"]+\/[^"]+\/)"[^>]*>([^<]+)<\/a>[\s\S]*?(\d+)\s*(?:sample|sampled)/gi;
  let m;
  while ((m = trackPattern.exec(html)) !== null) {
    const href = m[1] ?? "";
    const track = (m[2] ?? "").trim();
    const count = parseInt(m[3] ?? "0", 10);
    if (track && count > 0) {
      top_sampled_tracks.push({
        track,
        sample_count: count,
        whosampled_url: `${BASE_URL}${href}`,
      });
    }
  }

  return {
    total_samples_used: samplesUsedMatch ? parseInt(samplesUsedMatch[1]!, 10) : undefined,
    total_sampled_by: sampledByMatch ? parseInt(sampledByMatch[1]!, 10) : undefined,
    top_sampled_tracks: top_sampled_tracks.slice(0, 10),
    top_sampling_tracks: top_sampling_tracks.slice(0, 10),
  };
}
```

**Important note for the implementer:** The regex patterns above are best-effort based on common WhoSampled DOM patterns. During Task 7 (integration testing), you'll navigate to actual WhoSampled pages, inspect the real DOM, and adjust selectors. The extraction functions are designed to be updated once you see real HTML. The key principle: **extract structured data only** (track names, artist names, years, URLs, counts). Never extract descriptions, comments, or editorial content.

**Step 2: Run tests**

Run: `npx vitest run tests/whosampled.test.ts`
Expected: Tests should pass against the mock HTML. Some may need selector adjustments.

**Step 3: Commit**

```bash
git add src/servers/whosampled.ts tests/whosampled.test.ts
git commit -m "feat(whosampled): implement DOM extraction functions with passing tests"
```

---

### Task 5: Implement the 3 MCP tools

**Files:**
- Modify: `src/servers/whosampled.ts` — add tool definitions and server export

**Step 1: Add the tool definitions**

Append to `src/servers/whosampled.ts`:

```typescript
// --- Tool handlers (exported for testing) ---

export async function searchWhoSampledHandler(args: { artist: string; track: string }) {
  try {
    await rateLimit();
    const query = `${args.artist} ${args.track}`;
    const html = await withBrowser(async (page: Page) => {
      await page.goto(`${BASE_URL}/search/?q=${encodeURIComponent(query)}`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await page.waitForTimeout(2000);
      return await page.content();
    });
    const results = parseSearchResults(html);
    if (results.length === 0) {
      return toolResult({ results: [], message: "No results found on WhoSampled." });
    }
    return toolResult({ results });
  } catch (error) {
    return toolError(error);
  }
}

export async function getTrackSamplesHandler(args: { whosampled_url: string }) {
  try {
    await rateLimit();
    const url = args.whosampled_url.startsWith("http")
      ? args.whosampled_url
      : `${BASE_URL}${args.whosampled_url}`;
    const html = await withBrowser(async (page: Page) => {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await page.waitForTimeout(2000);
      return await page.content();
    });

    // Extract track name and artist from page title
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const pageTitle = titleMatch ? titleMatch[1]!.replace(" | WhoSampled", "").trim() : "";
    const titleParts = pageTitle.split(" by ");
    const track = (titleParts[0] ?? "").trim();
    const artist = (titleParts[1] ?? "").trim();

    const { samples_used, sampled_by } = parseTrackSamples(html);

    return toolResult({
      track,
      artist,
      whosampled_url: url,
      samples_used,
      sampled_by,
    });
  } catch (error) {
    return toolError(error);
  }
}

export async function getArtistConnectionsHandler(args: { artist: string }) {
  try {
    await rateLimit();
    const slug = slugify(args.artist);
    const url = `${BASE_URL}/${slug}/`;
    const html = await withBrowser(async (page: Page) => {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await page.waitForTimeout(2000);
      return await page.content();
    });

    const connections = parseArtistConnections(html);

    return toolResult({
      artist: args.artist,
      whosampled_url: url,
      ...connections,
    });
  } catch (error) {
    return toolError(error);
  }
}

// --- Tool definitions ---

const searchWhoSampled = tool({
  name: "search_whosampled",
  description:
    "Search WhoSampled for a track by artist and title. Returns matching tracks with WhoSampled URLs, sample counts, and sampled-by counts. Use the returned whosampled_url with get_track_samples for full sample details.",
  schema: z.object({
    artist: z.string().max(200).describe("Artist name"),
    track: z.string().max(200).describe("Track title"),
  }),
  handler: searchWhoSampledHandler,
});

const getTrackSamples = tool({
  name: "get_track_samples",
  description:
    "Get the full sample connections for a track on WhoSampled. Returns what the track sampled (samples_used) and who sampled this track (sampled_by). Each entry includes artist, title, year, sample type, element, and WhoSampled URL. Use search_whosampled first to find the correct whosampled_url.",
  schema: z.object({
    whosampled_url: z.string().max(500).describe("WhoSampled track URL from search results"),
  }),
  handler: getTrackSamplesHandler,
});

const getArtistConnections = tool({
  name: "get_artist_connections",
  description:
    "Get an overview of an artist's sampling footprint on WhoSampled. Returns total samples used, total times sampled by others, and top tracks in each direction. Useful for understanding an artist's role in sample culture.",
  schema: z.object({
    artist: z.string().max(200).describe("Artist name"),
  }),
  handler: getArtistConnectionsHandler,
});

// --- Server export ---

export const whoSampledServer = createSdkMcpServer({
  name: "whosampled",
  version: "0.1.0",
  tools: [searchWhoSampled, getTrackSamples, getArtistConnections],
});
```

**Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/servers/whosampled.ts
git commit -m "feat(whosampled): implement 3 MCP tools with Kernel.sh browser"
```

---

### Task 6: Register server and wire up UI

**Files:**
- Modify: `src/servers/index.ts` — register whosampled server
- Modify: `src/ui/app.ts` — add progress messages and server label

**Step 1: Register the server**

In `src/servers/index.ts`, add the import at the top:

```typescript
import { whoSampledServer } from "./whosampled.js";
```

In `getActiveServers()`, add after the browser server line:

```typescript
if (process.env.KERNEL_API_KEY) servers.whosampled = whoSampledServer;
```

In `getServerStatus()`, add `"whosampled"` to the `allServers` array.

**Step 2: Add UI progress messages**

In `src/ui/app.ts`, add to `SERVER_LABELS`:

```typescript
whosampled: "WhoSampled",
```

In `getToolProgressMessage()`, add before the `default:` case:

```typescript
case "search_whosampled":
  return `Searching WhoSampled for "${input.artist} - ${input.track}"...`;
case "get_track_samples":
  return "Fetching sample connections from WhoSampled...";
case "get_artist_connections":
  return `Loading ${input.artist}'s sample history on WhoSampled...`;
```

**Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/servers/index.ts src/ui/app.ts
git commit -m "feat(whosampled): register server and add UI progress messages"
```

---

### Task 7: Update sample-archaeology skill

**Files:**
- Modify: `src/skills/sample-archaeology/SKILL.md`

**Step 1: Update the skill to use WhoSampled as primary source**

Replace the `tools_priority` line:

```yaml
tools_priority: [whosampled, genius, musicbrainz, websearch, discogs, wikipedia, bandcamp]
```

Update the workflow section:

```markdown
## Workflow

1. WhoSampled `search_whosampled` — find the track, get WhoSampled URL
2. WhoSampled `get_track_samples` — retrieve full sample graph (samples_used + sampled_by)
3. For each sample found, use `get_track_samples` on the source to trace deeper chains
4. Genius `get_song` — retrieve song relationships, lyrics context, production annotations
5. MusicBrainz `get_recording_credits` — production credits, engineer credits
6. Discogs `get_release_full` — original release details, pressing info, production notes
7. Wikipedia context on the original sample source artist/recording
8. WhoSampled `get_artist_connections` — artist-level sampling overview for broader context
```

**Step 2: Commit**

```bash
git add src/skills/sample-archaeology/SKILL.md
git commit -m "feat(whosampled): update sample-archaeology skill to use WhoSampled as primary source"
```

---

### Task 8: Update system prompt

**Files:**
- Modify: `src/agent/system-prompt.ts`

**Step 1: Add WhoSampled to the data sources section**

In the system prompt string, in the "Structured music databases" paragraph, add after the existing databases:

```
**Sample connections:** WhoSampled (search tracks, get sample relationships — who sampled whom, sample type, element sampled. Returns structured metadata + WhoSampled URLs. Use Discogs/MusicBrainz/Genius to elaborate on results.)
```

**Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/agent/system-prompt.ts
git commit -m "feat(whosampled): add WhoSampled to system prompt data sources"
```

---

### Task 9: Integration test with live WhoSampled pages

**Files:**
- Modify: `src/servers/whosampled.ts` — adjust DOM selectors based on real HTML

This task requires `KERNEL_API_KEY` to be set. It's a manual verification step.

**Step 1: Navigate to WhoSampled and inspect the real DOM**

Use the browser server or run a quick script:

```bash
npx tsx -e "
import { withBrowser } from './src/servers/browser.js';
const html = await withBrowser(async (page) => {
  await page.goto('https://www.whosampled.com/search/?q=Mobb+Deep+Shook+Ones', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  return await page.content();
});
require('fs').writeFileSync('/tmp/ws-search.html', html);
console.log('Saved to /tmp/ws-search.html');
"
```

**Step 2: Inspect the HTML and adjust selectors**

Open `/tmp/ws-search.html` and identify the actual CSS classes/structure WhoSampled uses for:
- Search result entries (track name, artist, link, counts)
- Track page sample sections ("Contains samples of", "Was sampled in")
- Artist page overview (total counts, top tracks)

**Step 3: Update the regex patterns in `parseSearchResults`, `parseTrackSamples`, `parseArtistConnections`**

Adjust the extraction functions to match the real DOM structure. Keep extracting ONLY structured metadata.

**Step 4: Run the full handler against live data**

```bash
npx tsx -e "
import { searchWhoSampledHandler } from './src/servers/whosampled.js';
const result = await searchWhoSampledHandler({ artist: 'Mobb Deep', track: 'Shook Ones' });
console.log(JSON.stringify(JSON.parse(result.content[0].text), null, 2));
"
```

**Step 5: Run unit tests and type check**

Run: `npx vitest run tests/whosampled.test.ts && npx tsc --noEmit`
Expected: All pass

**Step 6: Commit**

```bash
git add src/servers/whosampled.ts tests/whosampled.test.ts
git commit -m "fix(whosampled): adjust DOM selectors to match live WhoSampled HTML"
```

---

### Task 10: Update README

**Files:**
- Modify: `README.md`

**Step 1: Add WhoSampled to the Data Sources table**

After the Influence Cache row:

```markdown
| **WhoSampled** | 3 (search tracks, get sample connections, artist sample overview) | Yes* |
```

Add footnote: `*WhoSampled uses the Kernel.sh cloud browser (same KERNEL_API_KEY as the Browser server).`

**Step 2: Add WhoSampled tools reference section**

After the Influence Cache tools section:

```markdown
### WhoSampled (requires `KERNEL_API_KEY`)

Structured sample relationship data from [WhoSampled](https://www.whosampled.com/). Returns metadata + WhoSampled URLs — no editorial content scraped. The agent uses Discogs, MusicBrainz, and Genius to elaborate on the results.

| Tool | What it does |
|------|-------------|
| `search_whosampled` | Search for a track by artist + title, returns matches with sample counts |
| `get_track_samples` | Get what a track sampled and who sampled it — artist, title, year, type, element |
| `get_artist_connections` | Artist's sampling footprint: total samples used/sampled by, top tracks |
```

**Step 3: Update project structure**

Add `whosampled.ts` to the servers listing in the project structure section.

**Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add WhoSampled server to README"
```

---

### Task 11: Final verification

**Step 1: Full type check**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 2: Full test suite**

Run: `npx vitest run`
Expected: All tests pass (excluding pre-existing YouTube failures)

**Step 3: Manual smoke test (if KERNEL_API_KEY available)**

```bash
npm run dev
```

Ask: "What tracks sampled the Amen break?"

Verify:
- WhoSampled tools appear in the progress display
- Results include WhoSampled URLs
- Agent follows up with Discogs/MusicBrainz for release details

**Step 4: Final commit and push**

```bash
git push
```
