# Crate CLI — Initial Scaffold Design

**Date:** 2026-02-20
**Status:** Approved
**Scope:** Project foundation, build system, first working vertical slice

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Agent framework | Claude Agent SDK V1 (`query()`) | Stable API, handles agent loop, tool dispatch, streaming. Crate's value is in MCP servers, not a custom agent loop. |
| Terminal UI | pi-tui (`@mariozechner/pi-tui`) | Differential rendering, no flicker, native scrollback, built-in Markdown + Editor with autocomplete. Same stack as OpenClaw. |
| Dev runner | tsx | Run TypeScript directly, zero config, fast feedback loop |
| Directory layout | Flat `src/` at root | Single-language project; serato-bridge can be a sibling dir later |
| Testing | Vitest | Low overhead, fast, ready from day one |
| First vertical slice | Chat + MusicBrainz | Proves full agent loop (input → tool dispatch → response) with zero API keys beyond Anthropic |

---

## Project Structure

```
crate-cli/
├── src/
│   ├── cli.ts                ← Entry point: pi-tui app, arg parsing, REPL loop
│   ├── ui/
│   │   ├── app.ts            ← TUI setup, component wiring, input routing
│   │   └── components.ts     ← Custom components (status bar, progress, etc.)
│   ├── agent/
│   │   ├── index.ts          ← CrateAgent class (wraps SDK query + session state)
│   │   └── system-prompt.ts  ← Agent personality + tool usage instructions
│   ├── servers/
│   │   ├── index.ts          ← Server registry (key-gating, detection, aggregation)
│   │   └── musicbrainz.ts    ← First MCP server: 6 tools, no API key needed
│   └── utils/
│       └── config.ts         ← Environment + defaults
├── tests/
│   └── musicbrainz.test.ts   ← Smoke test for MusicBrainz tools
├── docs/                     ← Planning docs (existing) + design docs
├── package.json
├── tsconfig.json
├── .env.example
└── .gitignore
```

---

## Dependencies

### Runtime
| Package | Purpose |
|---------|---------|
| `@anthropic-ai/claude-agent-sdk` | Agent framework — loop, tool dispatch, streaming |
| `zod` | Schema validation for tool inputs (SDK peer dep) |
| `@mariozechner/pi-tui` | Terminal UI — components, rendering, input |
| `chalk` | ANSI styling (pi-tui peer dep) |
| `dotenv` | Environment variable loading |

### Dev
| Package | Purpose |
|---------|---------|
| `tsx` | Run TypeScript directly during development |
| `vitest` | Test runner |
| `typescript` | Type checking |

### Not included (dropped from PRD)
| Package | Why |
|---------|-----|
| `ink`, `ink-text-input`, `react` | Replaced by pi-tui |

---

## CrateAgent Class

Thin wrapper around the SDK's `query()` function. Manages session state, model selection, and MCP server configuration.

```typescript
// src/agent/index.ts
import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { getActiveServers, getAllowedTools } from "../servers/index.js";
import { getSystemPrompt } from "./system-prompt.js";

const DEFAULT_MODEL = "claude-sonnet-4-6";

const AVAILABLE_MODELS: Record<string, string> = {
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-6",
  haiku: "claude-haiku-4-5-20251001",
};

export class CrateAgent {
  private model: string;
  private sessionId?: string;
  private servers: Record<string, any>;

  constructor(model?: string) {
    this.model = model ?? DEFAULT_MODEL;
    this.servers = getActiveServers();
  }

  get activeModel(): string {
    return this.model;
  }

  switchModel(alias: string): string {
    const resolved = AVAILABLE_MODELS[alias.toLowerCase()] ?? alias;
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
      },
    });

    for await (const message of stream) {
      if (message.type === "system" && message.subtype === "init") {
        this.sessionId = message.session_id;
      }
      yield message;
    }
  }
}
```

Key behaviors:
- `chat()` returns an AsyncGenerator so the UI can stream messages as they arrive
- Session ID captured on first query, passed via `resume` for multi-turn conversation
- Model switching updates `this.model`; takes effect on next `chat()` call
- Server registry provides only active MCP servers (key-gated servers excluded when keys are missing)

---

## MusicBrainz MCP Server

First MCP server. Free, no API key, 1 req/sec rate limit. 6 tools covering artist search, release lookup, and recording credits.

```typescript
// src/servers/musicbrainz.ts
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const BASE_URL = "https://musicbrainz.org/ws/2";
const USER_AGENT = "Crate/0.1.0 (https://github.com/user/crate-cli)";
const RATE_LIMIT_MS = 1100;

let lastRequest = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequest;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
  lastRequest = Date.now();
}

// Tools:
// 1. search_artist    — text search → ranked artist list
// 2. get_artist       — MBID → full artist with relationships
// 3. search_release   — text search → release list
// 4. get_release      — MBID → release with tracks + credits
// 5. search_recording — text search → recording list
// 6. get_recording_credits — MBID → recording with artist credits

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

Each tool follows the same pattern: rate limit → fetch → parse → return as JSON text content.

---

## Server Registry

Aggregates all active MCP servers based on available API keys and runtime detection.

```typescript
// src/servers/index.ts
import { musicbrainzServer } from "./musicbrainz.js";

export function getActiveServers(): Record<string, any> {
  const servers: Record<string, any> = {
    musicbrainz: musicbrainzServer, // always active — no key needed
  };

  // Future servers added conditionally:
  // if (process.env.DISCOGS_TOKEN) servers.discogs = discogsServer;
  // if (process.env.LASTFM_API_KEY) servers.lastfm = lastfmServer;
  // etc.

  return servers;
}

export function getAllowedTools(
  servers: Record<string, any>,
): string[] {
  return Object.keys(servers).map((name) => `mcp__${name}__*`);
}
```

---

## Terminal UI (pi-tui)

The UI uses pi-tui's imperative component model. The main components:

1. **Welcome text** — brief intro on startup
2. **Editor** — multi-line input with slash command autocomplete
3. **Loader** — shown while agent processes
4. **Markdown** — renders agent responses with streaming updates

```typescript
// src/ui/app.ts — conceptual structure
import {
  TUI,
  ProcessTerminal,
  Editor,
  Markdown,
  Loader,
  CombinedAutocompleteProvider,
} from "@mariozechner/pi-tui";
import chalk from "chalk";
import { CrateAgent } from "../agent/index.js";

export function createApp(agent: CrateAgent) {
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);

  // Slash command autocomplete
  const autocomplete = new CombinedAutocompleteProvider(
    [
      { name: "help", description: "Show available commands" },
      { name: "model", description: "Show or switch model" },
      { name: "clear", description: "Clear screen" },
      { name: "cost", description: "Show token usage" },
      { name: "quit", description: "Exit Crate" },
    ],
    process.cwd(),
  );

  const editor = new Editor(tui, editorTheme);
  editor.setAutocompleteProvider(autocomplete);

  editor.onSubmit = async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Handle slash commands locally
    if (trimmed.startsWith("/")) {
      handleSlashCommand(tui, agent, trimmed);
      return;
    }

    // Show user message
    addChild(tui, new Markdown(trimmed, 1, 1, mdTheme));

    // Show loader
    const loader = new Loader(tui, ...);
    addChild(tui, loader);
    editor.disableSubmit = true;
    tui.requestRender();

    // Stream agent response
    const response = new Markdown("", 1, 1, mdTheme);
    let accumulated = "";
    let loaderRemoved = false;

    for await (const msg of agent.chat(trimmed)) {
      if (msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "text") {
            if (!loaderRemoved) {
              tui.removeChild(loader);
              addChild(tui, response);
              loaderRemoved = true;
            }
            accumulated += block.text;
            response.setText(accumulated);
            tui.requestRender();
          }
        }
      }
    }

    if (!loaderRemoved) tui.removeChild(loader);
    editor.disableSubmit = false;
    tui.requestRender();
  };

  tui.addChild(editor);
  tui.setFocus(editor);

  return tui;
}

// Helper: insert child before editor (last child)
function addChild(tui: TUI, child: any) {
  tui.children.splice(tui.children.length - 1, 0, child);
}
```

---

## System Prompt

Defines the agent's personality and teaches it when/how to use each tool.

```typescript
// src/agent/system-prompt.ts
export function getSystemPrompt(): string {
  return `You are Crate, an expert music research agent. You help DJs, record collectors, music journalists, and serious listeners research music in depth.

## Your capabilities
You have access to MusicBrainz tools for:
- Searching for artists, releases, and recordings
- Looking up detailed artist info including relationships and collaborations
- Finding full release details with tracklists and credits
- Getting recording-level credits (producers, engineers, writers)

## How to research
- When asked about an artist, search first, then get full details with relationships
- For credit questions, look up the specific recording to get per-track credits
- For discography questions, search for releases by the artist
- Cross-reference MusicBrainz IDs across queries to build complete pictures
- Present findings clearly with markdown formatting

## Response style
- Be concise but thorough
- Use headers and lists for structure
- Offer to dig deeper when results are interesting
- If a search returns no results, suggest alternative spellings or related terms`;
}
```

---

## Slash Commands

Handled directly in the REPL loop — they do not go through the agent.

| Command | Action |
|---------|--------|
| `/help` | Display categorized command reference |
| `/model` | Show active model; `/model opus` or `/model haiku` to switch |
| `/clear` | Remove all children except editor, re-render |
| `/cost` | Show token usage from SDK result messages |
| `/quit` | Clean exit |

Future slash commands (`/collection`, `/playlists`, `/np`, `/pause`, etc.) will be added as their corresponding features are built.

---

## What the Scaffold Delivers

When complete, the user can:

1. `npm run dev` → launches pi-tui REPL with welcome message
2. Type a music question → agent uses MusicBrainz to research, streams Markdown response
3. `/model opus` → switches to Opus for deeper research
4. `/help` → shows available commands
5. `/quit` → clean exit

This proves the full vertical slice: **user input → agent reasoning → MusicBrainz tool dispatch → streamed Markdown response → pi-tui rendering**.

Everything in the PRD (more MCP servers, audio player, memory, collection, playlists, exports, evals) layers on top without changing the core architecture.
