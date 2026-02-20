# Crate — Technical Architecture

**Version:** 0.7.0
**Last Updated:** February 20, 2026

This document covers the technical architecture of Crate in detail. For product context, target users, and feature descriptions, see [PRD.md](PRD.md).

---

## System Overview

Crate is a single-process Node.js application. There are no microservices, no API gateway, no message queues. Everything runs in one TypeScript process:

- The **Ink React app** renders the terminal UI and captures input
- The **Claude Agent SDK** manages the agent loop, tool dispatch, and streaming
- **MCP servers** (in-process, not networked) expose tools to the agent
- **better-sqlite3** provides synchronous local persistence
- **Mem0 managed API** provides cross-session user memory via semantic search
- **mpv** runs as a background subprocess for audio playback, controlled via JSON IPC

```
┌──────────────────────────────────────────────────────────────────────┐
│  Node.js Process                                                     │
│                                                                      │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────────────┐   │
│  │  Ink UI   │◄──►│  CrateAgent  │◄──►│  MCP Server Registry     │   │
│  │ (React)   │    │  (SDK loop)  │    │  (16 servers)            │   │
│  └──────────┘    └──────┬───────┘    └──────────┬───────────────┘   │
│       ▲                 │                        │                   │
│       │ stdin/stdout    │ Session start/end       ▼                   │
│       │                 ▼                ┌────────────────────────┐  │
│       │         ┌───────────────┐        │  73 Agent Tools        │  │
│       │         │  Mem0 API     │        │  ├── External APIs     │  │
│       │         │  (managed)    │        │  ├── Local SQLite      │  │
│       │         │               │        │  ├── File System       │  │
│       │         │  User profile │        │  ├── Player Control    │  │
│       │         │  extraction   │        │  └── Memory (Mem0)     │  │
│       │         │  + retrieval  │        └────────────────────────┘  │
│       │         └───────────────┘                                    │
└───────┼──────────────────────────────────────────────────────────────┘
        │
        ▼
   Terminal (user)                    mpv subprocess (background audio)
                                      ▲
                                      │ JSON IPC (/tmp/crate-mpv-socket)
                                      │
                                   youtube.ts / radio.ts tools
```

---

## Server Architecture

### Registration and Key-Gating

All 16 MCP servers are registered in `src/servers/index.ts`. Each server declares its requirements:

```typescript
interface ServerRegistration {
  name: string;
  tools: Tool[];
  requiredKeys?: string[];      // Environment variables that must be set
  detection?: () => boolean;    // Runtime detection (e.g., Serato folder exists)
  optional?: boolean;           // If true, missing keys just disable the server
}
```

At startup, the registry:

1. Checks environment variables for each key-gated server
2. Runs detection functions for auto-detected servers
3. Registers only the servers whose requirements are met
4. Logs which servers are active/inactive (visible via `crate servers`)

### Server Categories

**Free servers (9 servers, 41 tools)** — Work out of the box with zero configuration beyond `ANTHROPIC_API_KEY`:

| Server | Tools | Data Access Method |
|--------|-------|--------------------|
| musicbrainz | 6 | REST API with User-Agent header |
| bandcamp | 5 | 5-layer HTML/JSON extraction (no API) |
| youtube | 4 | yt-dlp subprocess + optional YouTube Data API v3 |
| radio | 4 | Radio Browser API (free, no auth, 30,000+ stations) |
| news | 3 | RSS feed aggregation via rss-parser |
| collection | 6 | Local SQLite (~/.crate/collection.db) |
| playlist | 7 | Local SQLite (~/.crate/playlists.db) |
| export | 3 | Local SQLite (~/.crate/exports.db) + file system |

**Key-gated servers (7 servers, 27 tools)** — Require free API keys from their respective platforms:

| Server | Key(s) | Tools |
|--------|--------|-------|
| memory | MEM0_API_KEY | 4 |
| discogs | DISCOGS_TOKEN | 9 |
| spotify | SPOTIFY_CLIENT_ID + SECRET | 3 |
| lastfm | LASTFM_API_KEY | 3 |
| genius | GENIUS_ACCESS_TOKEN | 5 |
| events | TICKETMASTER_API_KEY | 3 |
| wikipedia | WIKIPEDIA_ACCESS_TOKEN | 3 |

**Auto-detected server (1 server, 5 tools)** — Enabled when Serato DJ software is installed:

| Server | Detection | Tools |
|--------|-----------|-------|
| serato | `_Serato_` folder exists in home directory | 5 |

### Hybrid Server: YouTube

The YouTube server is unique — it's categorized as free because all 4 tools work without an API key, but it's enhanced when `YOUTUBE_API_KEY` is present:

```
┌─────────────────────────────────────────────────────┐
│  youtube.ts                                          │
│                                                      │
│  search_tracks ─┬─ YOUTUBE_API_KEY set? ─► API v3   │
│                 └─ No key? ──────────────► yt-dlp    │
│                                                      │
│  play_track ──────► Always yt-dlp + mpv              │
│  play_playlist ───► Always M3U → mpv + yt-dlp        │
│  player_control ──► Always IPC to mpv                │
│                                                      │
│  API key only affects search metadata richness.      │
│  Playback never needs an API key.                    │
└─────────────────────────────────────────────────────┘
```

---

## User Memory System (Mem0)

### Overview

Crate uses Mem0's managed API for persistent user memory. The managed API handles LLM-based fact extraction, embedding, vector storage, and semantic retrieval — no local vector infrastructure required. Crate sends conversations in and gets relevant facts back. The memory server is optional: without `MEM0_API_KEY` all research tools work normally, but the agent has no memory of the user between sessions.

### Memory Server Tools (memory.ts)

```typescript
// Tool 1: Load user context at session start
get_user_context(query: string)
// Semantic search over stored memories, returns ranked facts.
// Called automatically at session start. Injects results into system prompt.

// Tool 2: Extract facts from a conversation
update_user_memory(messages: Message[], category?: MemoryCategory)
// Feeds conversation turns to Mem0's extraction pipeline.
// Mem0 identifies durable facts, deduplicates, updates contradictions.
// Called at session end with the last 20 turns.

// Tool 3: Explicit signal capture
remember_about_user(fact: string, category: MemoryCategory)
// Called mid-session when user explicitly corrects, reveals, or states a preference.
// Bypasses extraction — stores the fact directly.

// Tool 4: Inspect stored memories
list_user_memories(category?: MemoryCategory)
// Returns all stored memories, optionally filtered by category.
// Powers the /memory slash command.
```

Memory categories: `taste_preferences`, `collecting_focus`, `active_projects`, `research_expertise`, `workflow_patterns`.

### Session Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│  SESSION START                                                  │
│                                                                 │
│  CrateAgent.startSession()                                      │
│      │                                                          │
│      ▼                                                          │
│  get_user_context("music preferences collecting habits          │
│                    research focus current projects")            │
│      │                                                          │
│      ▼ returns ranked memory facts                              │
│  BASE_SYSTEM_PROMPT + "\n## What I know about this user\n"      │
│  + memories.map(m => `- ${m.fact}`).join("\n")                  │
│      │                                                          │
│      ▼                                                          │
│  Agent opens with personalized awareness — no re-introduction   │
│  needed, taste and context already loaded                       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  DURING SESSION                                                 │
│                                                                 │
│  Agent calls remember_about_user() when:                        │
│  - User explicitly states a preference                          │
│  - User corrects an assumption Crate made                       │
│  - User mentions a new project or goal                          │
│  - User's expertise level on a topic becomes clear              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  SESSION END (on /quit or process exit)                         │
│                                                                 │
│  CrateAgent.endSession(conversationHistory)                     │
│      │                                                          │
│      ▼ skip if < 6 exchanges (not substantive)                  │
│  update_user_memory(conversationHistory.slice(-20))             │
│      │                                                          │
│      ▼ Mem0 extraction pipeline runs                            │
│  LLM identifies durable facts from conversation                 │
│  Deduplicates against existing memories                         │
│  Updates facts that contradict earlier ones                     │
│  Discards transient/non-durable content                         │
│      │                                                          │
│      ▼                                                          │
│  User profile updated for next session                          │
└─────────────────────────────────────────────────────────────────┘
```

### What Mem0 Extracts

Mem0's LLM extraction pass reads the conversation and identifies facts worth keeping. For Crate users this typically includes:

- Format and label preferences surfaced during vinyl research ("prefers original pressings, skeptical of reissues")
- Scene expertise revealed during deep dives ("knows ECM catalog well, new to Chicago footwork")
- Active projects mentioned in passing ("building a late-night jazz show for March")
- Workflow signals ("always asks for BPM on electronic music", "exports show prep as Markdown")
- Taste corrections ("that's not my kind of jazz — I mean post-bop, not smooth jazz")

Mem0 automatically discards session-specific content (specific search queries, navigation steps) and retains only what generalizes to future sessions.

### Implementation

```typescript
// src/servers/memory.ts

import { MemoryClient } from "mem0ai";
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const USER_ID = "crate_user"; // single-user app, fixed ID

const memory = new MemoryClient({
  apiKey: process.env.MEM0_API_KEY || "",
});

const MemoryCategorySchema = z.enum([
  "taste_preferences",
  "collecting_focus",
  "active_projects",
  "research_expertise",
  "workflow_patterns",
]);

// get_user_context, update_user_memory, remember_about_user, list_user_memories
// — see full implementation in src/servers/memory.ts

export const memoryTools = [
  getUserContext,
  updateUserMemory,
  rememberAboutUser,
  listUserMemories,
];
```

```typescript
// src/agent/index.ts — session hooks

class CrateAgent {
  async startSession(): Promise<void> {
    if (!this.memoryEnabled) return;

    const result = await this.callTool("get_user_context", {
      query: "music preferences collecting habits research focus current projects taste",
    });

    if (result.has_context) {
      const memorySummary = result.memories
        .map((m: any) => `- ${m.fact}`)
        .join("\n");

      this.systemPrompt = `${BASE_SYSTEM_PROMPT}

## What I know about this user
${memorySummary}

Use this context to personalize all responses. Reference their collecting focus,
respect their taste, build on their existing expertise rather than explaining
things they already know.`;
    }
  }

  async endSession(): Promise<void> {
    if (!this.memoryEnabled) return;
    if (this.conversationHistory.length < 6) return;

    await this.callTool("update_user_memory", {
      messages: this.conversationHistory.slice(-20),
    });
  }
}
```

### Mem0 Managed API

Mem0's managed API handles the entire memory stack serverside: LLM-based fact extraction, text-embedding-3-small embeddings, and vector storage. The free tier (1M tokens processed, 10K searches/month) is sufficient for a single power user's session volume. Memories are stored in Mem0's cloud — the user ID `crate_user` is used as the namespace.

```
Crate process                     Mem0 cloud
─────────────                     ──────────
memory.add(messages)  ────────►  LLM extracts facts
                                  Embed facts
                                  Deduplicate / update
                                  Store in vector DB

memory.search(query)  ────────►  Embed query
                      ◄────────  Ranked relevant facts
```

No local vector infrastructure. No embedding model to manage. No SQLite extension required. The entire memory operation is two API calls.

---

## Model Selection

### Overview

Crate uses the Claude Agent SDK, which accepts a model string at instantiation. The default is `claude-sonnet-4-6` — the balanced choice for most research sessions. Users can select a different model at startup via `--model` flag or switch mid-session via `/model` slash command. The active model is stored in session state; switching takes effect on the next agent query.

### Available Models

| Model | String | Best For |
|-------|--------|----------|
| **Claude Sonnet 4.6** (default) | `claude-sonnet-4-6` | Everyday research — strong reasoning, fast, cost-efficient |
| **Claude Opus 4.6** | `claude-opus-4-6` | Deep research sessions — artist deep dives, scene mapping, complex cross-source synthesis |
| **Claude Haiku 4.5** | `claude-haiku-4-5-20251001` | Quick lookups — Discogs price checks, collection management, simple queries |

### Implementation

```typescript
// src/agent/index.ts

const DEFAULT_MODEL = "claude-sonnet-4-6";

const AVAILABLE_MODELS: Record<string, string> = {
  sonnet: "claude-sonnet-4-6",
  opus:   "claude-opus-4-6",
  haiku:  "claude-haiku-4-5-20251001",
};

class CrateAgent {
  private model: string;

  constructor(model: string = DEFAULT_MODEL) {
    this.model = model;
  }

  switchModel(alias: string): string {
    const resolved = AVAILABLE_MODELS[alias.toLowerCase()] ?? alias;
    this.model = resolved;
    return resolved;
  }

  async query(userMessage: string): Promise<AgentResponse> {
    return await claudeAgentSdk.query({
      model: this.model,
      system: this.systemPrompt,
      messages: this.conversationHistory,
      tools: this.activeTools,
    });
  }
}
```

### CLI Flag

```bash
crate --model claude-opus-4-6       # Full model string
crate --model opus                  # Alias — resolved to claude-opus-4-6
crate --model haiku                 # Alias — resolved to claude-haiku-4-5-20251001
```

### Slash Command

```
/model                              → Shows active model: claude-sonnet-4-6
/model opus                         → Switched to claude-opus-4-6
/model haiku                        → Switched to claude-haiku-4-5-20251001
/model claude-sonnet-4-6            → Full string also accepted
```

Model switches mid-session preserve conversation history — the new model picks up the full context of everything discussed so far.

### Usage Guidance (in /help and session start)

```
Models:  sonnet (default) · opus (deep research) · haiku (quick lookups)
         Switch with /model <name> or start with crate --model <name>
```

---

## In-Terminal Audio Player

### Design Principles

1. **Background process** — mpv runs as a subprocess; the user's conversation is never blocked
2. **IPC control** — JSON commands over a Unix socket, not signal-based (enables rich queries like "what's playing?")
3. **Required system deps** — yt-dlp and mpv are required runtime dependencies. The npm post-install script checks for both and surfaces install instructions before first use if either is missing.
4. **M3U for playlists** — mpv natively handles M3U playlists with `ytdl://` protocol entries; yt-dlp resolves each track on the fly
5. **Singleton player** — One mpv process at a time. New playback replaces the current track/playlist/radio stream.
6. **Exit cleanup** — `cleanupPlayer()` / `cleanupRadio()` registered on process exit kills any orphaned mpv

### Single Track Playback

```
play_track("Madlib - Road of the Lonely Ones")
    │
    ├── Has YOUTUBE_API_KEY? ──► YouTube Data API v3 search
    │                              └── Returns structured results (videoId, viewCount, etc.)
    └── No key? ───────────────► yt-dlp "ytsearch3:Madlib - Road of the Lonely Ones"
                                   └── Returns title, URL, duration, channel
    │
    ▼
Pick top result → start mpv with URL
    │
    mpv <url> --no-video --really-quiet --input-ipc-server=/tmp/crate-mpv-socket
    │
    ▼
Return track info to agent → agent tells user what's playing
```

### Playlist Playback

```
play_playlist({ playlist_id: 7, shuffle: true })
    │
    ▼
Read tracks from ~/.crate/playlists.db
    │ SELECT artist, title FROM playlist_tracks
    │ WHERE playlist_id = 7 ORDER BY position
    │
    ▼
Generate M3U:
    #EXTM3U
    #EXTINF:-1,Kamasi Washington - Truth
    ytdl://ytsearch1:Kamasi Washington - Truth
    #EXTINF:-1,Shabaka Hutchings - Black Meditation
    ytdl://ytsearch1:Shabaka Hutchings - Black Meditation
    ...
    │
    ▼
Write to /tmp/crate/playlist-7.m3u
    │
    ▼
mpv /tmp/crate/playlist-7.m3u --no-video --shuffle --input-ipc-server=/tmp/crate-mpv-socket
    │
    ▼
mpv resolves each ytdl://ytsearch1: entry via yt-dlp on the fly
    └── Track 1 plays → Track 2 resolves → Track 2 plays → ...
```

### Radio Streaming

```
play_radio({ station_name: "KEXP", tag: "indie" })
    │
    ▼
radio.ts searches Radio Browser API
    │ GET /json/stations/search?name=KEXP&tag=indie&limit=5
    │
    ▼
Select best match → extract stream URL
    │
    ▼
mpv <stream_url> --no-video --really-quiet --input-ipc-server=/tmp/crate-mpv-socket
    │
    ▼
Continuous streaming — same IPC controls (pause, volume, stop)
    └── No yt-dlp needed for radio streams
```

### IPC Protocol

mpv exposes a JSON IPC interface over a Unix domain socket at `/tmp/crate-mpv-socket`. Commands are newline-delimited JSON:

```json
{"command": ["set_property", "pause", true]}
{"command": ["set_property", "pause", false]}
{"command": ["cycle", "pause"]}
{"command": ["playlist-next"]}
{"command": ["playlist-prev"]}
{"command": ["get_property", "media-title"]}
{"command": ["get_property", "time-pos"]}
{"command": ["get_property", "duration"]}
{"command": ["get_property", "playlist-pos"]}
{"command": ["add", "volume", 10]}
{"command": ["add", "volume", -10]}
```

### Slash Command Mapping

These slash commands are handled directly in `cli.tsx` — they don't go through the agent:

| Slash Command | Implementation |
|---------------|---------------|
| `/np` | `player_control({ action: "now_playing" })` |
| `/pause` | `player_control({ action: "toggle_pause" })` |
| `/next` | `player_control({ action: "next" })` |
| `/prev` | `player_control({ action: "previous" })` |
| `/stop` | `player_control({ action: "stop" })` |
| `/model [alias]` | `agent.switchModel(alias)` → updates active model, displays confirmation |
| `/memory` | `list_user_memories({ category: "all" })` → formatted display |
| `/quit` | Triggers `endSession()` (memory extraction) then `cleanupPlayer()` then exit |

---

## Bandcamp 5-Layer Extraction

Bandcamp has no public API. Crate uses five data extraction methods, tried in priority order:

### Layer 1: Pagedata Parsing (Primary)

Every Bandcamp page includes a `<div id="pagedata" data-blob="...">` element containing URL-encoded JSON with complete page metadata. Decoded, this gives: artist info, album listings, track details, tags, location, related artists, and more.

### Layer 2: Internal Discover API

`/api/discover/1/discover_web` is Bandcamp's internal endpoint for their Discover page. Accepts genre tags, subgenres, location, format, and sort parameters. Returns structured JSON with album results.

### Layer 3: Search Page Parsing

Bandcamp's search at `bandcamp.com/search?q=...` returns HTML that cheerio parses into structured results including item type, name, URL, and metadata snippet.

### Layer 4: oEmbed Endpoint

`bandcamp.com/services/oembed` is an official endpoint that accepts any Bandcamp URL and returns embed metadata. Useful for verifying URLs and getting canonical metadata.

### Layer 5: RSS Feeds

Artist pages (`{artist}.bandcamp.com/feed`) and label pages provide RSS feeds of recent releases. Parsed via rss-parser for monitoring new releases from known artists/labels.

---

## Local Storage Schema

### collection.db

```sql
CREATE TABLE records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artist TEXT NOT NULL,
    title TEXT NOT NULL,
    format TEXT,          -- vinyl, cd, digital, cassette
    year INTEGER,
    label TEXT,
    rating REAL,          -- 0.0 to 5.0
    notes TEXT,
    status TEXT DEFAULT 'owned',  -- owned, want, ordered
    added_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE tags (
    record_id INTEGER REFERENCES records(id),
    tag TEXT NOT NULL,
    PRIMARY KEY (record_id, tag)
);

CREATE INDEX idx_records_artist ON records(artist);
CREATE INDEX idx_records_status ON records(status);
CREATE INDEX idx_tags_tag ON tags(tag);
```

### playlists.db

```sql
CREATE TABLE playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE playlist_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id INTEGER REFERENCES playlists(id),
    artist TEXT NOT NULL,
    title TEXT NOT NULL,
    album TEXT,
    position INTEGER NOT NULL,
    notes TEXT,
    youtube_url TEXT,
    added_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_tracks_playlist ON playlist_tracks(playlist_id);
```

### exports.db

```sql
CREATE TABLE exports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT,          -- artist, scene, genre, label, general
    format TEXT NOT NULL,    -- markdown, html, json
    filepath TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);
```

### evals.db

```sql
CREATE TABLE eval_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    question_count INTEGER,
    avg_score REAL,
    notes TEXT
);

CREATE TABLE eval_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER REFERENCES eval_runs(id),
    question_id TEXT NOT NULL,
    category TEXT NOT NULL,
    difficulty TEXT,
    correctness REAL,
    completeness REAL,
    tool_usage REAL,
    synthesis REAL,
    overall REAL,
    tools_used TEXT,        -- JSON array of tool names
    response_text TEXT,
    judge_reasoning TEXT
);
```

---

## API Integration Patterns

### Rate Limiting

Each external API server handles its own rate limiting:

| Server | Strategy |
|--------|----------|
| MusicBrainz | 1 req/sec enforced via delay between calls |
| Discogs | 60 req/min tracked via response headers |
| Spotify | Token refresh on 401; generous limits |
| Last.fm | No hard limit; respectful pacing |
| Bandcamp | Respectful delays between scrapes; no aggressive crawling |
| YouTube (API) | 10,000 units/day; 100 units per search |
| YouTube (yt-dlp) | Respectful; no concurrent searches |
| Genius | Generous; no special handling needed |
| Ticketmaster | 5,000/day; tracked via response headers |
| Wikipedia | Generous; User-Agent required |
| Radio Browser | Generous; free, no auth, community-maintained |
| Mem0 | Free tier: 1M tokens processed, 10K searches/month — sufficient for single-user |

### Error Handling

All tool handlers follow the same pattern:

```typescript
async ({ param }) => {
  try {
    const data = await fetch(...);
    if (!data.ok) {
      if (data.status === 401) throw new Error("Invalid API key...");
      if (data.status === 404) throw new Error("Not found...");
      if (data.status === 429) throw new Error("Rate limited...");
      throw new Error(`API error: ${data.status}`);
    }
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  } catch (error) {
    return { content: [{ type: "text", text: JSON.stringify({ error: error.message }) }] };
  }
}
```

Errors are returned as tool results, not thrown. The agent sees the error message and can retry, try a different source, or explain the issue to the user.

### Authentication Patterns

| Pattern | Used By | Implementation |
|---------|---------|---------------|
| No auth | MusicBrainz, Bandcamp, Radio Browser, RSS | User-Agent header only |
| API key in query param | YouTube Data API, Ticketmaster | `?key=${process.env.KEY}` |
| API key in header | Discogs, Last.fm | `Authorization: Discogs token=...` |
| Bearer token | Genius, Wikipedia | `Authorization: Bearer ${token}` |
| OAuth client credentials | Spotify | Token exchange → Bearer header |
| SDK client | Mem0 | `new MemoryClient({ apiKey: process.env.MEM0_API_KEY })` |
| Subprocess | yt-dlp, mpv | `execSync()` / `spawn()` |

---

## Eval Framework

### Flow

```
crate eval [options]
    │
    ├── Parse options (category, difficulty, id, verbose, notes)
    │
    ├── Load questions from dataset.ts
    │   └── Filter by category/difficulty/id
    │
    ├── For each question:
    │   ├── Create fresh CrateAgent instance (memory disabled for eval runs)
    │   ├── Call agent.research(question.text)
    │   ├── Collect response + tools used
    │   ├── Send to LLM judge (Claude Sonnet)
    │   │   └── Score 0-10 on: correctness, completeness, tool_usage, synthesis
    │   └── Store result in evals.db
    │
    ├── Compare with previous run
    │   └── Flag regressions where Δ > 2.0 on any dimension
    │
    └── Print summary report
        ├── Overall score
        ├── Category breakdowns
        ├── Pass/fail (threshold: avg ≥ 5.0)
        └── Regressions flagged
```

Note: eval runs use a fresh CrateAgent instance with memory disabled to ensure reproducible, user-context-free scoring.

### Question Format

```typescript
interface EvalQuestion {
  id: string;                    // e.g., "credits-01"
  category: EvalCategory;        // e.g., "credits"
  difficulty: "easy" | "medium" | "hard";
  question: string;              // Natural language research question
  expected_tools: string[];      // Tools the agent should use
  scoring_criteria: string;      // What the judge should look for
  ground_truth?: string[];       // Optional known facts for verification
}
```

### Judge Prompt

The LLM judge receives: the original question, expected tools, scoring criteria, ground truth (if any), the agent's response, and the tools the agent actually used. It returns scores and reasoning for each dimension.

---

## Key Counts

| Metric | Value |
|--------|-------|
| Total tools | 73 |
| MCP servers | 16 |
| External data sources | 10 |
| RSS publications | 9 |
| Local databases | 4 |
| Free servers | 9 (41 tools) |
| Key-gated servers | 7 (27 tools) |
| Auto-detected servers | 1 (5 tools) |
| Memory provider | Mem0 managed API |
| Available models | 3 (Sonnet default, Opus, Haiku) |
| Eval questions | 60 |
| Eval categories | 10 |
| REPL slash commands | 15 |
| Export formats | 7 (4 playlist + 3 report) |
