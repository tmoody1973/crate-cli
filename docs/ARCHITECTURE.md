# Crate Architecture

This is the canonical architecture doc. Historical drafts live in [archive/](archive/).

## System Shape

Crate is a single-process Node.js application with a separate marketing site in `www/`.

The CLI runtime is composed of:

- `src/cli.ts` - process entrypoint and mode selection
- `src/ui/` - terminal UI built with `@mariozechner/pi-tui`
- `src/agent/` - query routing, planning, prompt construction, and streaming
- `src/servers/` - in-process MCP-style tool servers
- `src/utils/` - config, SQLite helpers, player helpers, scratchpad logging
- `SOUL.md` - the top-of-prompt identity file loaded at startup

The website runtime is separate:

- `www/` - Next.js app for the public marketing/demo site

## Runtime Flow

1. `src/cli.ts` parses flags and starts either the interactive app or the MCP server.
2. `createApp()` in `src/ui/app.ts` boots the terminal UI and slash commands.
3. `CrateAgent` in `src/agent/index.ts` resolves the model and active servers.
4. `src/agent/router.ts` classifies the query as `chat`, `lookup`, or `research`.
5. The agent optionally loads memory, activates a matching skill, and generates a plan for research-tier queries.
6. The Claude Agent SDK runs the query loop against the active in-process servers.
7. Tool calls, plans, and answers are written to the scratchpad JSONL logs.

## Major Components

### UI Layer

The terminal UI lives in `src/ui/` and is built with `pi-tui`, not Ink. It handles:

- onboarding
- slash commands
- progress rendering
- now-playing status
- post-response receipts and hints

### Agent Layer

The agent layer lives in `src/agent/` and handles:

- model selection
- query routing
- skill loading
- planning
- memory injection
- typed event streaming to the UI

### Server Layer

Tool servers live in `src/servers/`. They are activated dynamically based on:

- always-on availability
- shared fallback keys resolved in `src/utils/config.ts`
- explicit user-provided keys

There are currently two server registries:

- `src/servers/index.ts` for the interactive agent
- `src/servers/tool-registry.ts` for MCP server mode

These must stay aligned. Long term, they should probably be unified into one source of truth.

## Activation Model

### Always On

- MusicBrainz
- Wikipedia
- Bandcamp
- YouTube
- Radio
- News
- Collection
- Playlist
- Influence Cache
- Telegraph
- iTunes

### Active By Default Via Shared Fallback Keys

- Discogs
- Last.fm
- Ticketmaster

### Bring Your Own Key

- Genius
- Mem0
- Tavily / Exa web search
- Influence search
- Tumblr
- Kernel browser / WhoSampled

## Persistence

Crate uses local SQLite files under `~/.crate/` for stateful features, including:

- collection data
- playlist data
- influence cache
- other feature-specific databases

Scratchpad session logs are stored separately under `~/.crate/scratchpad/`.

## Audio Stack

Playback is handled outside the LLM loop:

- `yt-dlp` resolves or streams YouTube content
- `mpv` plays tracks, playlists, and radio
- JSON IPC is used for playback control and status

The shared player implementation lives in `src/utils/player.ts`.

## Testing

The main app uses Vitest. Tests cover:

- server handlers
- registry behavior
- agent configuration
- player behavior
- utility layers

The website has its own toolchain under `www/`.

## Current Sharp Edges

- Documentation and website copy can drift because claims live in multiple places.
- Server activation logic is duplicated across two registries.
- Shared fallback keys are a deliberate product decision and need to be documented consistently anywhere key handling is discussed.
