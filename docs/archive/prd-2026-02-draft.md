# Crate — Product Requirements Document

**Version:** 0.7.0
**Last Updated:** February 20, 2026
**Status:** Active Development — Model Selection + Planned Feature Expansion

---

## Why a CLI for Music Research Is a Game-Changer

The music discovery and research landscape is broken into silos. A working DJ, radio programmer, record collector, or music journalist currently bounces between a dozen tabs — Discogs for pressings, Spotify for audio previews, MusicBrainz for credits, Genius for annotations, Wikipedia for biography, Pitchfork for reviews, Ticketmaster for show dates, YouTube for deep cuts — copy-pasting between them, losing context with every switch. Each platform owns a piece of the picture; none of them talk to each other.

A CLI agent changes this fundamentally. Not because the command line is better than a GUI — it's better because it's **composable**. When an AI agent sits at the center of 9+ music data sources, it can do things no single platform can:

**Cross-referencing is automatic.** Ask "who produced this track?" and the agent checks MusicBrainz credits, cross-references with Genius production credits, pulls biographical context from Wikipedia, finds the producer's other work on Discogs, checks their upcoming shows on Ticketmaster, and pulls recent reviews from Pitchfork — in one conversational turn. No human could run that workflow in under 10 minutes. The agent does it in seconds.

**Context accumulates — across sessions.** The agent knows your collection (what you own, what you want, what you've rated highly), your tags (how you think about music), your past research, and your playlists. And now, through Mem0-powered persistent memory, it knows *you* — your collecting focus, your taste, your active projects, your research expertise. Every session picks up where the last one left off. Spotify's algorithm knows what you stream. Crate knows what you *think* about what you stream, and it remembers.

**The terminal is the native habitat of power users.** DJs, radio programmers, and serious collectors are not casual listeners. They're researchers. They think in terms of label catalogs, pressing variants, sample chains, scene timelines. A conversational CLI meets them where they already work — fast, keyboard-driven, no visual clutter, pure information density. The Ink terminal UI gives you React-powered component rendering with styled output, without the overhead of a browser.

**Music plays while you research.** Crate has a built-in audio player powered by yt-dlp + mpv. Ask the agent to play a track or an entire playlist — it streams in the background while you keep chatting. Hear a sample chain in real time while the agent traces its history. Build a playlist during a discovery session and play it back without leaving the terminal.

**Export closes the loop.** Research that lives in a chat window is dead research. Crate exports to M3U (playback), Markdown (show prep), HTML (sharing), JSON (programmatic use). A playlist built during a research session can go straight into mpv, a radio log, or a blog post. The CLI is the starting point, not the endpoint.

**It's extensible by design.** Every data source is an in-process MCP server — a TypeScript file with Zod-validated tool definitions. Adding a new source is a single file and a registration entry. The agent's system prompt tells it when and how to use each source. No UI redesign needed, no API gateway, no microservices.

**The AI agent is the product.** This isn't a wrapper around APIs with a chatbot bolted on. The agent *is* the researcher. It decides which sources to query, how to combine results, when to cross-reference, and how to present findings. The tools are its hands; the system prompt is its expertise; the conversation is the interface. Claude's reasoning about music — connecting a Detroit techno producer to a Chicago house sample to a Japanese reissue label — is the value that no API aggregator can replicate.

The closest analog isn't another music app. It's having a deeply knowledgeable record store clerk who has instant access to every database in the music industry, remembers everything you've ever talked about — not just today, but across every visit — and works at the speed of your typing.

---

## Product Overview

**Crate** is an autonomous AI agent for deep music research and discovery, built on the Claude Agent SDK (TypeScript). It runs as a terminal application with an Ink-powered React UI, connecting to 10 external data sources, 9 RSS publication feeds, and 4 local persistence layers through 73 agent tools across 16 MCP servers. An in-terminal audio player (yt-dlp + mpv) lets users listen to tracks, playlists, and live radio while they research. Persistent user memory powered by Mem0 means Crate knows who you are across every session.

### Target Users

- **DJs & Radio Programmers** — Show prep, tracklist building, artist research, scene mapping
- **Record Collectors** — Vinyl valuation, pressing identification, collection management, want-list tracking
- **Music Journalists & Bloggers** — Artist deep dives, scene reports, review research, exportable write-ups
- **A&R / Label Scouts** — Artist discovery, catalog analysis, market research, trend identification
- **Serious Listeners** — Anyone who researches music beyond surface-level streaming recommendations

### Core Value Propositions

1. **Unified research** — One conversation replaces 12 browser tabs
2. **Persistent user memory** — Crate knows your taste, focus, and expertise across every session
3. **Accumulated context** — Collection, tags, ratings, and history inform every response
4. **Actionable output** — Research exports to playable playlists, show prep docs, shareable reports
5. **In-terminal playback** — Listen to tracks and playlists while you research, no API key required
6. **Expert reasoning** — Claude doesn't just fetch data; it connects dots across sources
7. **Extensible architecture** — New data sources are single-file MCP server additions

---

## Architecture

### System Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Runtime | Node.js (TypeScript) | Core application, single-process |
| Agent | Claude Agent SDK (TS) | Agent loop, tool dispatch, streaming, subagents |
| Model | Claude Sonnet (default) / selectable | Reasoning and conversation — Opus for deep research, Haiku for quick lookups |
| UI | Ink (React for terminals) | Component-based terminal rendering |
| HTTP | Native fetch | All external API calls |
| Storage | better-sqlite3 (sync) | Collection, playlists, exports, evals, cache |
| Memory | Mem0 managed API | Persistent user taste profile, cross-session personalization |
| Config | dotenv + encrypted keystore | API key management |
| Scraping | cheerio | HTML parsing (Genius credits, Bandcamp) |
| RSS | rss-parser | Music publication feed aggregation |
| Playback | yt-dlp + mpv | Background audio streaming with IPC control |

### Data Flow

```
Session Start
    ↓
Mem0: get_user_context — load taste profile, active projects, research expertise
    ↓
System prompt enriched with user context
    ↓
User Query
    ↓
CLI (src/cli.tsx) — Ink React app, handles input/display/slash commands
    ↓
Agent (src/agent/) — Claude Agent SDK query(), system prompt, tool dispatch
    ↓
MCP Servers (src/servers/*.ts) — 73 tools across 16 named servers
    ↓                        ↓                    ↓                   ↓
External APIs          Local SQLite DBs      File System          Player
(10 sources + RSS)     (collection,           (exports,           (mpv subprocess,
                        playlists,             reports)             IPC socket)
                        evals)
    ↓
Agent synthesizes results → Ink UI renders response → Terminal output
                                                       ↕
                                                    Background audio
                                                    (mpv via IPC)
Session End
    ↓
Mem0: update_user_memory — extract durable facts from conversation, update profile
```

### File Structure

```
crate/
├── ts/
│   ├── src/
│   │   ├── agent/
│   │   │   ├── index.ts          ← CrateAgent class (SDK wrapper)
│   │   │   └── system-prompt.ts  ← Agent personality + tool usage guide
│   │   ├── cli.tsx               ← Ink React entry, arg parsing, slash commands
│   │   ├── ui/
│   │   │   └── App.tsx           ← Main React component tree
│   │   ├── servers/
│   │   │   ├── index.ts          ← Server registry, key-gating, detection
│   │   │   ├── musicbrainz.ts    ← 6 tools — metadata, credits, relationships
│   │   │   ├── bandcamp.ts       ← 5 tools — indie search, albums, discovery
│   │   │   ├── discogs.ts        ← 9 tools — search, artists, labels, masters, marketplace, releases
│   │   │   ├── spotify.ts        ← 3 tools — audio features, popularity, top tracks
│   │   │   ├── lastfm.ts         ← 3 tools — similar artists, tags, trends
│   │   │   ├── genius.ts         ← 5 tools — credits, annotations, samples
│   │   │   ├── youtube.ts        ← 4 tools — search, play, playlist playback, player control
│   │   │   ├── radio.ts          ← 4 tools — search, browse, tags, play live radio
│   │   │   ├── events.ts         ← 3 tools — concerts, artist events, venues
│   │   │   ├── wikipedia.ts      ← 3 tools — search, summary, full article
│   │   │   ├── news.ts           ← 3 tools — search, reviews, sources
│   │   │   ├── memory.ts         ← 4 tools — get context, update memory, remember, list memories
│   │   │   ├── collection.ts     ← 6 tools — add, search, update, remove, stats, tags
│   │   │   ├── playlist.ts       ← 7 tools — create, add, list, get, remove, export, delete
│   │   │   └── export.ts         ← 3 tools — save report, list, read
│   │   ├── utils/
│   │   │   ├── keystore.ts       ← Encrypted API key storage
│   │   │   └── config.ts         ← Environment + defaults
│   │   └── evals/
│   │       ├── dataset.ts        ← 60 research questions, 10 categories
│   │       ├── judge.ts          ← LLM-as-judge scoring (4 dimensions)
│   │       ├── runner.ts         ← Eval orchestration + reporting
│   │       ├── store.ts          ← SQLite result storage + regression detection
│   │       └── index.ts          ← Public eval API
│   ├── serato-bridge/
│   │   └── crate_serato_mcp/     ← Python MCP server (5 tools)
│   ├── package.json
│   └── tsconfig.json
├── PRD.md                        ← This document
├── ARCHITECTURE.md               ← Technical architecture details
└── .env.example
```

---

## Data Sources

### External APIs (10 sources)

| Source | Auth | Rate Limit | Primary Value |
|--------|------|-----------|---------------|
| **MusicBrainz** | None (User-Agent) | 1 req/sec | Canonical metadata, relationships, credits |
| **Discogs** | Token | 60 req/min | Artist profiles, label catalogs, master releases, marketplace pricing, pressing details, credits |
| **Spotify** | OAuth (client credentials) | Generous | Audio features (BPM, key, energy), popularity metrics |
| **Last.fm** | API key | Generous | Listener trends, similar artists, community tags |
| **Bandcamp** | None (scraping) | Respectful | Indie/underground releases, local scenes |
| **YouTube** | None (yt-dlp) / Optional API key | Respectful / 10,000 units/day | Audio search, playback, playlist streaming |
| **Genius** | Bearer token (free) | Generous | Writing/production credits, sample chains, annotations |
| **Ticketmaster** | API key (free) | 5,000/day | Concerts, tours, venues, ticket prices |
| **Wikipedia** | Personal API token (free) | Generous | Artist bios, genre histories, cultural context, label backgrounds |
| **Radio Browser** | None | Generous | 30,000+ live radio stations, genre/country/language search, streaming |

### User Memory (Mem0 Managed API)

Mem0 is the persistent memory layer for Crate's understanding of the user. Unlike structured local databases (collection, playlists), Mem0 stores semantic facts extracted from conversations — taste, preferences, expertise, and active projects — and retrieves relevant context through semantic search.

**What Mem0 stores:**
- Taste and genre preferences (e.g. "focuses on original Blue Note pressings from the 1950s-60s, skeptical of reissues")
- Collecting focus (e.g. "vinyl-only collector, interested in Japanese pressings of American jazz")
- Active projects (e.g. "building a late-night jazz show for February, needs 90 minutes of material")
- Research expertise (e.g. "knows ECM catalog extensively, currently learning about Chicago footwork scene")
- Workflow patterns (e.g. "prefers BPM and key data included for any electronic music recommendation")

**How it works:**
- At session start, `get_user_context` pulls semantically relevant memories and injects them into the system prompt — the very first response already knows who it's talking to
- During sessions, the agent can explicitly call `remember_about_user` when the user reveals important preferences or corrects an assumption
- At session end, `update_user_memory` feeds the full conversation to Mem0's extraction pipeline, which automatically identifies durable facts, deduplicates against existing memories, and updates anything that has changed
- The `/memory` slash command surfaces everything Crate knows about the user in a readable, categorized view

**Memory categories:**

| Category | Examples |
|----------|----------|
| `taste_preferences` | Genre focus, format preferences, attitude toward reissues, label affinities |
| `collecting_focus` | What they're actively hunting, budget signals, condition standards |
| `active_projects` | Current show prep, articles in progress, events being researched |
| `research_expertise` | Artists/scenes/labels they know deeply vs. are exploring for the first time |
| `workflow_patterns` | How technical they want responses, what they export, what tools they lean on |

### RSS Aggregation (9 publications, no auth)

Pitchfork, Stereogum, Resident Advisor, The Quietus, BrooklynVegan, Bandcamp Daily, NME, Consequence of Sound, FACT — fetched concurrently via rss-parser.

### Bandcamp Integration (No API — 5-Layer Extraction)

Bandcamp has no public API. Crate uses a five-layer data extraction approach:

1. **Pagedata parsing** — `<div id="pagedata" data-blob="...">` contains escaped JSON with complete page metadata
2. **Internal discover API** — `/api/discover/1/discover_web` endpoint for genre/tag browsing
3. **Search page parsing** — HTML parsing of search results with cheerio
4. **oEmbed endpoint** — Official `/services/oembed` for embed metadata
5. **RSS feeds** — Artist and label feeds for recent releases

### Discogs Integration (Expanded — 9 Endpoints)

Discogs is the world's largest physical music database, and Crate leverages 9 of its API endpoints for comprehensive research:

- **Artist profiles** — Biographies, real names, group members, aliases, side projects, external URLs
- **Artist discographies** — Full release history, sortable by year/title/format, including appearances and collaborations
- **Label profiles** — Label bios, contact info, sublabel/parent hierarchies (e.g. Blue Note → Capitol → Universal)
- **Label catalogs** — Complete release catalogs with catalog numbers, chronological browsing
- **Master releases** — Canonical album representation with tracklist, genres, styles, lowest marketplace price
- **Master versions** — All pressings/variants filtered by country, format, and label — essential for collectors
- **Full release details** — Complete tracklist with per-track credits (producer, engineer, writer, performer), identifiers (barcode, matrix/runout, ISRC), pressing notes, community ratings
- **Marketplace stats** — Lowest price, number for sale, blocked-from-sale status
- **Database search** — Filter by type, genre, style, country, year, format, catalog number, barcode, credits

### Radio Browser Integration (Free — No API Key)

Radio Browser (radio-browser.info) provides access to 30,000+ live radio stations worldwide — completely free, open source, community-maintained, no API key needed. Crate uses it for station search, genre browsing, tag discovery, and live streaming via mpv.

### YouTube Integration (Hybrid — Free Playback + Optional API)

YouTube is Crate's audio layer, built with a hybrid architecture that ensures playback always works. Without an API key, yt-dlp handles all search and audio extraction. With `YOUTUBE_API_KEY`, search returns richer metadata. Playback always uses yt-dlp + mpv regardless.

### Local Persistence (4 databases)

| Database | Purpose | Technology |
|----------|---------|------------|
| `~/.crate/collection.db` | Personal music library (records, tags, ratings) | better-sqlite3 |
| `~/.crate/playlists.db` | Curated tracklists with metadata | better-sqlite3 |
| `~/.crate/exports.db` | Saved research reports index | better-sqlite3 |
| `~/.crate/evals.db` | Eval run history and results | better-sqlite3 |

---

## In-Terminal Audio Player

Crate includes a built-in audio player that runs in the background while users research. Music plays — tracks, playlists, and live radio — while conversation continues.

### Architecture

```
Agent calls play_track / play_playlist / play_radio
    ↓
youtube.ts or radio.ts generates playback target
    ↓ (single track URL, temp M3U file, or radio stream URL)
mpv subprocess (--no-video, --really-quiet)
    ↓
IPC socket (/tmp/crate-mpv-socket)
    ↓
Slash commands or player_control tool
(pause, resume, next, previous, stop, now_playing, volume)
```

### Capabilities

| Feature | How It Works |
|---------|-------------|
| **Single track** | `play_track` searches YouTube via yt-dlp or API, plays top result in background |
| **Full playlist** | `play_playlist` reads tracklist from SQLite, generates M3U with `ytdl://ytsearch1:` entries, mpv streams each track sequentially |
| **Live radio** | `play_radio` streams live radio stations directly via mpv — no yt-dlp needed for radio |
| **Shuffle** | mpv's native `--shuffle` flag on playlist playback |
| **Track skipping** | `next` / `previous` via IPC commands to mpv |
| **Now playing** | Queries mpv for media title, position, duration, playlist index |
| **Volume control** | IPC volume adjustment (±10% per command) |
| **Background play** | mpv runs as detached subprocess — user keeps chatting |
| **Cleanup** | `cleanupPlayer()` / `cleanupRadio()` registered on process exit, kills orphaned mpv |

### System Dependencies

| Tool | Purpose | Install |
|------|-------------|---------|
| **yt-dlp** | Search + audio extraction | `brew install yt-dlp` / `sudo apt install yt-dlp` |
| **mpv** | Background audio playback + IPC | `brew install mpv` / `sudo apt install mpv` |

Both are required runtime dependencies for audio functionality. The post-install script (`npm install -g crate-music`) checks for both and surfaces install instructions before first use if either is missing.

---

## Tool Inventory (73 tools across 16 servers)

### Free Servers (9 servers, 41 tools — no API keys needed)

| Server | Tools | Function |
|--------|-------|----------|
| **musicbrainz** | search_artist, get_artist, search_release, get_release, search_recording, get_recording_credits | Canonical metadata, credits, relationships |
| **bandcamp** | search_bandcamp, get_artist_page, get_album, discover_music, get_tag_info | Indie music, local scenes, genre browsing |
| **youtube** | search_tracks, play_track, play_playlist, player_control | Audio search, playback, playlist streaming, player control (yt-dlp + mpv) |
| **radio** | search_radio, browse_radio, get_radio_tags, play_radio | 30,000+ live radio stations, genre/country search, live streaming (mpv) |
| **news** | search_music_news, get_latest_reviews, get_news_sources | 9 publication RSS aggregation |
| **collection** | collection_add, collection_search, collection_update, collection_remove, collection_stats, collection_tags | Personal library management |
| **playlist** | playlist_create, playlist_add_track, playlist_list, playlist_get, playlist_remove_track, playlist_export, playlist_delete | Tracklist curation and export |
| **export** | export_report, list_exports, read_export | Research report persistence |

### Key-Gated Servers (7 servers, 27 tools — require free API keys)

| Server | Key Required | Tools | Function |
|--------|-------------|-------|----------|
| **memory** | MEM0_API_KEY | get_user_context, update_user_memory, remember_about_user, list_user_memories | Persistent user taste profile, cross-session personalization |
| **discogs** | DISCOGS_TOKEN | search_discogs, get_artist_discogs, get_artist_releases, get_label, get_label_releases, get_master, get_master_versions, get_marketplace_stats, get_release_full | Artist profiles, discographies, label catalogs, master releases, pressings, marketplace pricing |
| **spotify** | SPOTIFY_CLIENT_ID + SECRET | search_artist_spotify, get_audio_features, get_top_tracks | BPM, key, energy, popularity |
| **lastfm** | LASTFM_API_KEY | get_similar_artists, get_top_tags, get_listening_trends | Listener data, similar artists, tags |
| **genius** | GENIUS_ACCESS_TOKEN | search_genius, get_song, get_artist_info, get_artist_songs, get_song_annotations | Credits, samples, annotations |
| **events** | TICKETMASTER_API_KEY | search_events, get_artist_events, search_venues | Concerts, tours, venues |
| **wikipedia** | WIKIPEDIA_ACCESS_TOKEN | search_articles, get_summary, get_article | Bios, genre history, cultural context |

### Auto-Detected Server (1 server, 5 tools — requires Serato installation)

| Server | Detection | Tools | Function |
|--------|-----------|-------|----------|
| **serato** | _Serato_ folder exists | list_crates, get_crate_tracks, add_to_crate, read_track_metadata, export_usb | DJ crate management via Python bridge |

---

## CLI Commands

```bash
# Interactive research mode
crate                              # Start REPL (default: claude-sonnet-4-6)
crate --model claude-opus-4-6      # Deep research session with Opus
crate --model claude-haiku-4-5-20251001  # Fast lookups with Haiku

# Model information
crate models                       # List available models with capability notes

# Eval suite
crate eval                         # Run all 60 eval questions
crate eval -c credits              # Run one category (10 categories available)
crate eval -d hard                 # Run by difficulty
crate eval --id credits-01         # Run specific question(s)
crate eval --verbose --notes "v2"  # Verbose output + tag the run
crate eval history                 # Show past eval runs
crate eval detail 3                # Detailed results for run #3

# Configuration
crate keys                         # Manage API keys
crate servers                      # Show active/inactive servers
crate --help                       # All commands
```

### REPL Slash Commands

| Command | Action |
|---------|--------|
| `/help` | Show all commands |
| `/clear` | Clear terminal |
| `/history` | Conversation history |
| `/model` | Show active model; `/model opus` or `/model haiku` to switch mid-session |
| `/memory` | Show everything Crate knows about you — taste profile, active projects, expertise |
| `/collection` | Quick collection stats |
| `/playlists` | List all playlists |
| `/exports` | List saved reports |
| `/cost` | Token usage and estimated cost for current session |
| `/np` | Now playing — current track, position, playlist index |
| `/pause` | Toggle pause/resume playback |
| `/next` | Skip to next track (playlist mode) |
| `/prev` | Skip to previous track (playlist mode) |
| `/stop` | Stop playback and kill mpv |
| `/quit` | Exit (auto-cleans up mpv process, triggers session memory extraction) |

All other input is passed to the agent as a natural language query.

---

## Agent Behavior

### System Prompt Principles

The agent operates with domain expertise encoded in its system prompt:

1. **Source selection** — Knows which API to use for which question type (MusicBrainz for metadata, Discogs for pressings, Genius for credits, Wikipedia for biographical/historical context, etc.)
2. **Cross-referencing** — Automatically combines data from multiple sources when it adds value
3. **Memory-first personalization** — Opens every session by loading user context from Mem0; tailors responses to known taste, focus, and expertise level without requiring re-introduction
4. **Collection awareness** — Searches the user's collection before recommending records; uses tags and ratings to understand taste
5. **Wikipedia integration** — Uses Wikipedia for narrative context that structured APIs can't provide (artist life stories, genre origins, cultural movements, label histories)
6. **Active memory capture** — Recognizes when users reveal preferences, correct assumptions, or complete projects, and calls `remember_about_user` explicitly to persist that signal
7. **Proactive playback** — Offers to play tracks during research, plays samples while explaining sample chains, streams playlists built during discovery sessions
8. **Export readiness** — Offers to save research when it's substantial enough to be useful later

### Memory Lifecycle

```
Session Start
  ↓
get_user_context("music preferences collecting habits research focus")
  ↓
Relevant memories injected into system prompt
  ↓
Agent opens session with personalized awareness:
"Welcome back. Last time you were deep in Blue Note's 1960s roster..."
  ↓
[Session continues — research, discovery, collection management]
  ↓
During session: remember_about_user() called for explicit signals
(user corrects assumption, reveals preference, starts new project)
  ↓
Session End (on /quit or process exit)
  ↓
update_user_memory(last 20 conversation turns)
  ↓
Mem0 extraction pipeline identifies durable facts:
- New preferences discovered
- Existing facts updated or contradicted
- Active projects progressed or completed
  ↓
Profile updated for next session
```

### Research Skills

Pre-written methodology templates guide the agent through complex research workflows:

- **Artist Deep Dive** — Discography, influences, collaborations, market presence, biographical context
- **Scene Mapping** — Geographic/temporal scene analysis, key artists, venues, labels
- **Vinyl Valuation** — Pressing identification, market comparisons, condition assessment

---

## Eval Suite

Crate includes a comprehensive evaluation framework for measuring research quality.

### Architecture

```
crate eval --category credits --verbose
  ↓
Question Selection (dataset.ts) — filter by category/difficulty/id
  ↓
Agent Execution (runner.ts) — CrateAgent.research() per question
  ↓
LLM Judge (judge.ts) — Claude Sonnet scores 0-10 on 4 dimensions
  ↓
Result Storage (store.ts) — SQLite: ~/.crate/evals.db
  ↓
Regression Detection — compare vs previous run, flag Δ > 2.0
  ↓
Summary Report — category breakdowns, pass/fail, regressions
```

### Dataset

60 questions across 10 categories, each with difficulty rating, expected tools, scoring criteria, and optional ground truth facts:

| Category | Questions | Focus |
|----------|-----------|-------|
| credits | 6 | Production, writing, engineering credits |
| discography | 6 | Release history, catalog completeness |
| discovery | 6 | Finding new music by taste/mood/genre |
| marketplace | 6 | Vinyl pricing, pressing identification |
| audio_analysis | 6 | BPM, key, sonic characteristics |
| events | 6 | Tour dates, venue info, festivals |
| news | 6 | Recent coverage, reviews, interviews |
| cross_source | 6 | Multi-source synthesis (3-5 APIs) |
| collection | 6 | Personal library operations |
| edge_cases | 6 | Error handling, ambiguous queries, not-found |

### Scoring Dimensions (0-10 each)

| Dimension | What It Measures |
|-----------|------------------|
| **Correctness** | Factual accuracy of data points |
| **Completeness** | Coverage of all aspects of the question |
| **Tool Usage** | Appropriate selection and use of data sources |
| **Synthesis** | Quality of multi-source integration and narrative |

Pass threshold: overall average ≥ 5.0 (exit code 1 for CI if below).

---

## Export Formats

### Playlists

| Format | Use Case | Details |
|--------|----------|---------|
| Markdown | Show prep, sharing | Formatted track list with notes and metadata |
| M3U | Playback | Standard playlist file; uses `ytdl://ytsearch1:` entries for mpv + yt-dlp resolution |
| JSON | Programmatic | Full structured data for integration |
| Text | Radio logs | Simple numbered list for broadcast prep |

### Research Reports

| Format | Use Case | Details |
|--------|----------|---------|
| Markdown | General purpose | Frontmatter + content, categories as subdirectories |
| HTML | Sharing, presentation | Dark terminal-inspired theme, responsive, styled tables |
| JSON | Archival, integration | Structured with title, content, category, timestamp |

---

## API Keys Required

| Key | Required | Source | Used By |
|-----|----------|--------|---------|
| `ANTHROPIC_API_KEY` | **Yes** | console.anthropic.com | Agent (Claude) |
| `MEM0_API_KEY` | Recommended | app.mem0.ai | Memory server — persistent user profile across sessions |
| `DISCOGS_TOKEN` | Recommended | discogs.com/settings/developers | Discogs server |
| `LASTFM_API_KEY` | Recommended | last.fm/api/account/create | Last.fm server |
| `SPOTIFY_CLIENT_ID` | Recommended | developer.spotify.com/dashboard | Spotify server |
| `SPOTIFY_CLIENT_SECRET` | Recommended | developer.spotify.com/dashboard | Spotify server |
| `GENIUS_ACCESS_TOKEN` | Optional | genius.com/api-clients | Genius server |
| `YOUTUBE_API_KEY` | Optional (enhances search) | console.cloud.google.com | YouTube server (richer search metadata only) |
| `TICKETMASTER_API_KEY` | Optional | developer.ticketmaster.com | Events server |
| `WIKIPEDIA_ACCESS_TOKEN` | Optional | api.wikimedia.org/wiki/Getting_started | Wikipedia server |

MusicBrainz, Bandcamp, YouTube (playback + basic search via yt-dlp), Radio Browser, Music News, Collection, Playlist, and Export require no API keys. Without `MEM0_API_KEY`, Crate works normally but does not remember the user across sessions.

---

## Dependencies

### Core (package.json)

| Package | Purpose |
|---------|---------|
| @anthropic-ai/claude-agent-sdk | Agent framework — loop, tool dispatch, streaming |
| @anthropic-ai/sdk | Direct API calls (eval judge, standalone queries) |
| mem0ai | Managed memory API — user taste profile, cross-session personalization |
| zod | Schema validation for all tool inputs |
| ink + ink-text-input + react | Terminal UI components |
| better-sqlite3 | Synchronous SQLite for all local persistence |
| cheerio | HTML parsing (Genius credits scraping, Bandcamp) |
| rss-parser | Music publication RSS feed aggregation |
| dotenv | Environment variable loading |

### Required (System)

| Tool | Purpose | Install |
|------|---------|---------|
| yt-dlp | YouTube search + audio extraction | `brew install yt-dlp` / `sudo apt install yt-dlp` |
| mpv | Background audio playback + IPC control | `brew install mpv` / `sudo apt install mpv` |

These are core runtime dependencies. Without them, `play_track`, `play_playlist`, `search_tracks`, and `player_control` do not function. The post-install script checks for both and prints install instructions if either is missing.

### Optional (System)

| Tool | Purpose | Required For |
|------|---------|-------------|
| Python 3 | Serato bridge | Only if using Serato tools |

---

## Future Considerations

### High-Impact Additions (Planned)

- **Spotify Playlist Push** — Export Crate playlists directly to Spotify account. OAuth scope expansion to `playlist-modify-public/private`; user authorizes once via browser, token stored in keystore. Closes the loop between research and listening.
- **Apple Music Export** — MusicKit JS integration for playlist export to Apple Music. Companion to Spotify Push for users in the Apple ecosystem.
- **Firecrawl Integration** — General-purpose web scraping for arbitrary music pages (blog posts, label sites, festival lineups) not covered by specialized APIs. User provides own key at firecrawl.dev. Unlocks any URL as a research source.
- **Semantic Search** — Vector embeddings over collection and research history, enabling "find me something like this" queries across everything the user owns and has researched. Likely built on SQLite-vec to stay local-first, consistent with the rest of the persistence stack.
- **Spinitron Integration** — College/community radio intelligence: what's being played where, which stations are breaking which artists. Valuable for radio programmers and A&R.
- **Comparison Engine** — Side-by-side artist/album/label analysis with structured output. "Compare the ECM and Blue Note approaches to jazz in the 1970s" as a first-class research mode.
- **npm Global Install** — `npm install -g crate-music` for one-command setup. Publish to npm with a proper bin entry, post-install check for yt-dlp and mpv, and a first-run onboarding flow. This is the distribution mechanism that makes Crate accessible to non-developers.

### Nice-to-Have

- **Watch Mode / Alerts** — Discogs marketplace monitors for want-list items with price thresholds
- **Graph Explorer** — Visual relationship mapping via MusicBrainz connections
- **Beatport/Traxsource** — Electronic music retail data
- **Bandsintown** — Alternative/complement to Ticketmaster for indie shows
- **SoundCloud** — DJ mixes, unreleased tracks, underground scenes
- **Rate Your Music** — Community ratings and lists
- **Voice Input** — Speak queries while digging through crates
- **CI/CD Integration** — GitHub Actions workflow to run evals on PRs
