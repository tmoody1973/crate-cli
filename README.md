# Crate

> AI-powered music research agent for the terminal

Crate is a CLI tool that helps DJs, record collectors, music journalists, and serious listeners research music in depth. It uses Claude as an AI agent with direct access to multiple music databases, returning structured, cross-referenced results in a rich terminal UI — with built-in audio playback and live radio streaming.

## How It Works

Ask questions in natural language. Crate's agent searches across multiple databases, cross-references results, and presents findings with markdown formatting directly in your terminal.

```
> Who produced Madvillainy?

Searching MusicBrainz for "Madvillainy"...
Fetching release details...

# Madvillainy (2004)

**Artist:** Madvillain (MF DOOM + Madlib)
**Label:** Stones Throw Records
**Produced by:** Madlib

| # | Track              | Length |
|---|-------------------|--------|
| 1 | The Illest Villains | 2:00  |
| 2 | Accordion          | 2:00  |
...
```

Play music directly from the conversation:

```
> Play Accordion by Madvillain

▶ Accordion - Madvillain · MADVILLAINY  ━━━━━━━━━●──────── 1:12 / 2:00  vol:100
```

Stream live radio from 30,000+ stations worldwide:

```
> Play some jazz radio

Tuning in to "WBGO Jazz 88.3"...

* Miles Davis - So What · WBGO  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~  LIVE  vol:100
```

## Use Cases

Crate is built for anyone who researches music seriously. Here's what that looks like in practice:

**DJ / Radio Programmer** — show prep, tracklist building, sample tracing
```
I'm doing a jazz-to-hip-hop set. Find me 5 jazz records from the
60s-70s that were heavily sampled in 90s boom-bap. For each, give
me the original and the hip-hop track that sampled it.
```

**Record Collector** — pressing identification, vinyl valuation, label deep dives
```
I have a copy of Kind of Blue on Columbia with a "6-eye" label.
What pressing is this, what's it worth, and how do I verify it's
an original vs. a reissue?
```

**Music Journalist** — artist profiles, scene reports, credits research
```
Map the key figures in the Detroit-Berlin techno connection. Start
with the original Detroit producers who had their biggest impact
in Europe.
```

**A&R / Label Scout** — artist discovery, catalog analysis, trend mapping
```
Give me a complete analysis of Stones Throw Records — full catalog,
key artists, genre distribution, and what kind of releases they
focus on.
```

**Serious Listener** — deep dives, discovery, playlist building
```
I want to learn about Afrobeat from the beginning. Give me the
history, who created it, and build me a 15-track chronological
playlist from Fela to today.
```

Each prompt triggers cross-referencing across multiple databases — no single source has the full picture. See **[docs/USE_CASES.md](docs/USE_CASES.md)** for 20 detailed case studies with multi-turn prompt sequences, slash command usage, and advanced workflows.

## Data Sources

| Source | Tools | API Key Required |
|--------|-------|------------------|
| **MusicBrainz** | 6 (artist, release, recording search + details) | No |
| **Wikipedia** | 3 (search, summary, full article) | No |
| **Bandcamp** | 6 (search, artist, album, discover + location, tags, editorial) | No |
| **YouTube** | 4 (search, play track, play playlist, player control) | No* |
| **Radio Browser** | 4 (search, browse, tags, play station) | No |
| **Discogs** | 9 (search, artist, release, label, master, marketplace) | Yes |
| **Last.fm** | 8 (artist/album/track stats, similar artists, tags, geo) | Yes |
| **Genius** | 6 (song search, annotations, artist info) | Yes |
| **Web Search** | 3 (search, find similar, extract content) | Yes* |

MusicBrainz, Wikipedia, Bandcamp, YouTube, and Radio Browser are always available — no API keys needed. The others activate automatically when you provide their API keys.

*Web Search uses dual providers — Tavily (keyword) and Exa.ai (neural/semantic). Either key enables the server; both keys unlock the full toolkit.

*YouTube search works without a key via yt-dlp scraping. Set `YOUTUBE_API_KEY` for faster, richer search results.

Wikipedia supports optional [Wikimedia Enterprise](https://enterprise.wikimedia.com/) credentials for richer article content, with automatic fallback to free endpoints.

## Tools Reference

Crate's agent has access to **67 tools** across 12 MCP servers. You don't call these directly — describe what you need and the agent picks the right tools automatically. Below is the full reference for what's available.

### MusicBrainz (always available)

| Tool | What it does |
|------|-------------|
| `search_artist` | Search for artists by name — returns IDs, type, country |
| `get_artist` | Full artist details: relationships, collaborations, discography |
| `search_release` | Search for albums/singles/EPs, optionally filter by artist |
| `get_release` | Full release details: tracklist, credits, label info |
| `search_recording` | Search for individual tracks, optionally filter by artist |
| `get_recording_credits` | Detailed credits for a recording: producer, engineer, etc. |

### Wikipedia (always available)

| Tool | What it does |
|------|-------------|
| `search_articles` | Search Wikipedia for artist bios, genre histories, label backgrounds |
| `get_summary` | Quick article summary — fast and token-efficient |
| `get_article` | Full article content as clean plaintext for deep research |

### Bandcamp (always available)

| Tool | What it does |
|------|-------------|
| `search_bandcamp` | Search for artists, albums, tracks, or labels. Supports `location` filter (e.g. "Milwaukee") |
| `get_artist_page` | Full artist/label profile: bio, discography, links |
| `get_album` | Full album details: tracklist, tags, credits, pricing |
| `discover_music` | Browse trending/new releases by genre tag. Supports `location` filter for city-based discovery |
| `get_tag_info` | Genre/tag info and related tags |
| `get_bandcamp_editorial` | Bandcamp Daily articles, reviews, and features |

### YouTube (always available)

| Tool | What it does |
|------|-------------|
| `search_tracks` | Search YouTube for music tracks |
| `play_track` | Play a track from a search query or YouTube URL |
| `play_playlist` | Play a list of tracks as a playlist, supports shuffle |
| `player_control` | Pause, resume, next, previous, stop, volume, now playing |

### Radio Browser (always available)

| Tool | What it does |
|------|-------------|
| `search_radio` | Search stations by name, genre tag, country, or language |
| `browse_radio` | Browse top stations by tag or country, sorted by popularity |
| `get_radio_tags` | List available genre/style tags with station counts |
| `play_radio` | Stream a live radio station via mpv (by URL or station name) |

### Collection (always available)

| Tool | What it does |
|------|-------------|
| `collection_add` | Add a record: artist, title, format, year, label, rating, tags |
| `collection_search` | Search by text, artist, status, tag, or format |
| `collection_update` | Update any fields on a record |
| `collection_remove` | Remove a record |
| `collection_stats` | Stats: totals by status/format/decade, average rating, top tags |
| `collection_tags` | List all tags with counts |

### Playlist (always available)

| Tool | What it does |
|------|-------------|
| `playlist_create` | Create a new playlist |
| `playlist_add_track` | Add a track to a playlist at a specific position |
| `playlist_list` | List all playlists with track counts |
| `playlist_get` | Get a playlist with all tracks (chainable with `play_playlist`) |
| `playlist_remove_track` | Remove a track from a playlist |
| `playlist_export` | Export as markdown, M3U, or JSON |
| `playlist_delete` | Delete a playlist and all its tracks |

### Discogs (requires `DISCOGS_KEY` + `DISCOGS_SECRET`)

| Tool | What it does |
|------|-------------|
| `search_discogs` | Search for artists, releases, masters, or labels |
| `get_artist_discogs` | Full artist profile: bio, members, aliases, images |
| `get_artist_releases` | Full discography with year, format, label, role |
| `get_label` | Label profile: bio, contact, sublabels |
| `get_label_releases` | Label catalog with artist, year, format, catalog number |
| `get_master` | Master release: groups all pressings/formats, tracklist, genres |
| `get_master_versions` | All versions of a master: pressings, formats, countries |
| `get_release_full` | Full release: tracklist with per-track credits, identifiers, notes |
| `get_marketplace_stats` | Marketplace pricing: lowest price, number for sale |

### Last.fm (requires `LASTFM_API_KEY`)

| Tool | What it does |
|------|-------------|
| `get_artist_info` | Artist stats: listener/play counts, similar artists, bio |
| `get_album_info` | Album stats: listener/play counts, tracklist, tags, wiki |
| `get_track_info` | Track stats: listener/play counts, tags, album info |
| `get_similar_artists` | Similar artists with match scores (0-1) |
| `get_similar_tracks` | Similar tracks with match scores |
| `get_top_tracks` | Artist's most popular tracks by play count |
| `get_tag_artists` | Top artists for a genre/mood/scene tag |
| `get_geo_top_tracks` | Most popular tracks in a specific country |

### Genius (requires `GENIUS_ACCESS_TOKEN`)

| Tool | What it does |
|------|-------------|
| `search_songs` | Search for songs by title, artist, or lyrics snippet |
| `get_song` | Full song details: producers, writers, samples, relationships |
| `get_song_annotations` | Crowd-sourced lyric explanations and interpretations |
| `get_artist_genius` | Artist profile: bio, social media, alternate names |
| `get_artist_songs_genius` | Artist's songs sorted by popularity or title |
| `get_annotation` | Specific annotation with votes and verification status |

### Memory (requires `MEM0_API_KEY`)

| Tool | What it does |
|------|-------------|
| `get_user_context` | Search stored memories about your preferences and interests |
| `update_user_memory` | Auto-extract and store facts from conversation |
| `remember_about_user` | Explicitly store a single fact about you |
| `list_user_memories` | List all stored memories, optionally by category |

### Web Search (requires `TAVILY_API_KEY` and/or `EXA_API_KEY`)

| Tool | What it does |
|------|-------------|
| `search_web` | Search the open web for music blogs, scene reports, festival lineups, forum threads |
| `find_similar` | Find pages semantically similar to a URL (e.g., "find labels like Stones Throw") |
| `extract_content` | Extract clean text from URLs for deep reading |

Dual-provider architecture: Tavily handles keyword search with domain filtering and time ranges; Exa.ai handles neural/semantic search and find-similar. Either key enables the server.

## Quick Start

### Prerequisites

- Node.js 20+
- npm
- An [Anthropic API key](https://console.anthropic.com/)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — YouTube audio extraction
- [mpv](https://mpv.io/) — audio playback

```bash
# macOS
brew install yt-dlp mpv

# Linux
sudo apt install yt-dlp mpv    # or your package manager
```

### Installation

```bash
git clone https://github.com/your-username/crate-cli.git
cd crate-cli
npm install
cp .env.example .env
```

Edit `.env` and add your Anthropic API key:

```
ANTHROPIC_API_KEY=your-key-here
```

### Run

```bash
npm run dev
```

### Model Selection

Crate defaults to Claude Haiku for fast responses. Switch models at startup:

```bash
npm run dev              # Haiku (default) — fast lookups
npm run dev:opus         # Opus — deep research
npm run dev:haiku        # Haiku — explicit
```

Or pass any model directly:

```bash
npx tsx src/cli.ts --model sonnet
```

## Commands

Type `/` to see all commands in the autocomplete dropdown.

### Player

| Command | Description |
|---------|-------------|
| `/play <query>` | Play a track from YouTube |
| `/pause` | Toggle pause/resume |
| `/next` | Next track (playlist) |
| `/prev` | Previous track (playlist) |
| `/stop` | Stop playback |
| `/vol [0-150]` | Set or show volume |
| `/np` | Now playing info |

A now-playing bar auto-appears at the bottom of the terminal during playback, showing track info, progress, and volume.

### Session

| Command | Description |
|---------|-------------|
| `/model [name]` | Show or switch model (sonnet, opus, haiku) |
| `/cost` | Show token usage and cost |
| `/servers` | Show active/inactive servers |
| `/keys` | Manage API keys (add, edit, remove) |
| `/clear` | Clear the screen |
| `/help` | Show help |
| `/quit` | Exit Crate |

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude | Yes |
| `DISCOGS_KEY` | Discogs API consumer key | No |
| `DISCOGS_SECRET` | Discogs API consumer secret | No |
| `LASTFM_API_KEY` | Last.fm API key | No |
| `GENIUS_ACCESS_TOKEN` | Genius API access token | No |
| `TAVILY_API_KEY` | Tavily web search (keyword) | No |
| `EXA_API_KEY` | Exa.ai web search (neural/semantic) | No |
| `MEM0_API_KEY` | Persistent memory across sessions | No |
| `YOUTUBE_API_KEY` | YouTube Data API key (enhances search) | No |
| `TICKETMASTER_API_KEY` | Live event and concert discovery | No |

All keys can be managed interactively from within Crate using the `/keys` command — no need to edit `.env` manually.

## Project Structure

```
crate-cli/
├── src/
│   ├── cli.ts                 # Entry point, arg parsing
│   ├── agent/
│   │   ├── index.ts           # CrateAgent class (wraps Claude Agent SDK)
│   │   └── system-prompt.ts   # Agent personality and tool docs
│   ├── servers/
│   │   ├── index.ts           # Server registry (key-gated activation)
│   │   ├── musicbrainz.ts     # MusicBrainz MCP server (6 tools)
│   │   ├── discogs.ts         # Discogs MCP server (9 tools)
│   │   ├── genius.ts          # Genius MCP server (6 tools)
│   │   ├── lastfm.ts          # Last.fm MCP server (8 tools)
│   │   ├── wikipedia.ts       # Wikipedia MCP server (3 tools)
│   │   ├── bandcamp.ts        # Bandcamp MCP server (6 tools)
│   │   ├── youtube.ts         # YouTube player MCP server (4 tools)
│   │   ├── radio.ts           # Radio Browser MCP server (4 tools)
│   │   ├── web-search.ts      # Web search MCP server (3 tools, Tavily + Exa)
│   │   ├── collection.ts      # Local collection manager (SQLite)
│   │   ├── playlist.ts        # Playlist manager (SQLite)
│   │   └── memory.ts          # Mem0 persistent memory
│   ├── ui/
│   │   ├── app.ts             # TUI setup, slash commands
│   │   ├── components.ts      # Themes, banner, hyperlinks
│   │   ├── keys-panel.ts      # Interactive API key management (/keys)
│   │   └── now-playing.ts     # Now-playing bar overlay
│   └── utils/
│       ├── config.ts          # Model resolution, env config
│       ├── env.ts             # .env file read/write utilities
│       └── player.ts          # Shared mpv player infrastructure
├── tests/
├── docs/                      # Design docs and plans
├── package.json
└── tsconfig.json
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| AI Agent | [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk) |
| Terminal UI | [pi-tui](https://github.com/nicfontaine/pi-tui) |
| Tool Protocol | [MCP](https://modelcontextprotocol.io/) (in-process servers) |
| Audio | [mpv](https://mpv.io/) via IPC + [yt-dlp](https://github.com/yt-dlp/yt-dlp) |
| Language | TypeScript (ES2022, strict) |
| Runtime | Node.js via tsx |
| Testing | Vitest |

## Development

```bash
npm run dev           # Start dev session
npm test              # Run tests
npm run test:watch    # Watch mode
npm run typecheck     # Type check without emitting
```

## License

MIT
