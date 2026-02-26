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

## Influence Network

Crate includes a research-backed influence mapping system based on the [Stell-R methodology](https://hdsr.mitpress.mit.edu/pub/t4txmd81/release/2) (Badillo-Goicoechea, *Harvard Data Science Review*, Fall 2025). The paper demonstrated that artist co-mentions in music reviews — when Pitchfork reviews Radiohead and mentions Aphex Twin in the same paragraph — are a powerful proxy for artistic influence, outperforming collaborative filtering for exploration-oriented discovery.

Crate implements this in three layers:

**Review-Driven Discovery** — Search 23 music publications using Tavily keyword search (advanced depth) with Exa neural discovery for related reviews. Extract full review text and identify co-mentioned artists using influence phrase detection ("influenced by", "reminiscent of", "in the vein of").

```
> Search for reviews of Burial's Untrue and extract all influence signals

🔍 Searching music publications for "Burial" — Untrue…
🧬 Extracting co-mentions & influence signals from review text…

Found 8 co-mentions with influence context:
  Massive Attack (3 mentions, influence phrase: "owes a debt to")
  Aphex Twin (2 mentions, influence phrase: "reminiscent of")
  ...
```

**Influence Tracing** — Build multi-hop paths between artists using Tavily advanced search for direct connections and Exa neural search for neighborhood discovery. Find bridge artists that connect disconnected genres via Exa crossover search.

```
> Trace the influence path from Kraftwerk to Radiohead

🔗 Tracing influence path: Kraftwerk → Radiohead

  Kraftwerk
    │ influenced (Wikipedia: "pioneered electronic pop")
    ▼
  Depeche Mode
    │ co-mentioned (Pitchfork review of OK Computer)
    ▼
  Radiohead
```

**Influence Cache** — Every discovered connection is persisted to a local SQLite graph (`~/.crate/influence.db`). Future queries check the cache first for instant results. The graph grows with every question you ask.

```
> Show me the influence graph stats

📊 247 artists · 512 edges · 1,038 source citations
   Top: Brian Eno (34 connections), David Bowie (28), Aphex Twin (23)
```

See **[docs/INFLUENCE-NETWORK.md](docs/INFLUENCE-NETWORK.md)** for the full deep-dive.

## Data Sources

| Source | Tools | API Key Required |
|--------|-------|------------------|
| **MusicBrainz** | 6 (artist, release, recording search + details) | No |
| **Wikipedia** | 3 (search, summary, full article) | No |
| **Bandcamp** | 8 (search, artist, album, artist tracks, discover + location, tags, editorial) | No |
| **YouTube** | 4 (search, play track, play playlist, player control) | No* |
| **Radio Browser** | 4 (search, browse, tags, play station) | No |
| **News / RSS** | 3 (search news, latest reviews, list sources) | No |
| **Influence Cache** | 8 (cache edges, lookup, BFS path, search, stats, aliases) | No |
| **Discogs** | 9 (search, artist, release, label, master, marketplace) | Yes |
| **Last.fm** | 8 (artist/album/track stats, similar artists, tags, geo) | Yes |
| **Genius** | 6 (song search, annotations, artist info) | Yes |
| **Web Search** | 3 (search, find similar, extract content) | Yes* |
| **Influence Network** | 4 (search reviews, extract influences, trace path, bridge artists) | Yes* |
| **Telegraph** | 5 (setup page, post, view page, list entries, delete entry) | No |
| **Tumblr** | 5 (connect, post, blog info, disconnect, status) | Yes |
| **Browser** | 2 (browse URL, screenshot page) | Yes |

MusicBrainz, Wikipedia, Bandcamp, YouTube, Radio Browser, News, Influence Cache, and Telegraph are always available — no API keys needed. The others activate automatically when you provide their API keys.

*Web Search and Influence Network use dual providers — Tavily (keyword) and Exa.ai (neural/semantic). Either key enables both servers; both keys unlock the full toolkit.

*YouTube search works without a key via yt-dlp scraping. Set `YOUTUBE_API_KEY` for faster, richer search results.

Wikipedia supports optional [Wikimedia Enterprise](https://enterprise.wikimedia.com/) credentials for richer article content, with automatic fallback to free endpoints.

## Tools Reference

Crate's agent has access to **95 tools** across 18 MCP servers. You don't call these directly — describe what you need and the agent picks the right tools automatically. Below is the full reference for what's available.

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
| `get_artist_tracks` | Get all tracks from an artist's discography in one call — essential for verified playlist building with independent artists |
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

### News / RSS (always available)

| Tool | What it does |
|------|-------------|
| `search_music_news` | Search recent music news across 10 publications by keyword |
| `get_latest_reviews` | Latest album/track reviews from Pitchfork, Bandcamp Daily, The Quietus |
| `get_news_sources` | List all RSS sources with status and last update time |

Sources: Pitchfork, Stereogum, Resident Advisor, The Quietus, BrooklynVegan, Bandcamp Daily, NME, Consequence of Sound, FACT Magazine, NPR Music.

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

### Influence Network (requires `TAVILY_API_KEY` and/or `EXA_API_KEY`)

Purpose-built tools for tracing artistic influence through music criticism, based on the [Stell-R methodology](https://hdsr.mitpress.mit.edu/pub/t4txmd81/release/2) (Badillo-Goicoechea, *Harvard Data Science Review*, Fall 2025) — which demonstrated that artist co-mentions in 61,000+ album reviews are a powerful proxy for artistic influence and connection.

| Tool | What it does |
|------|-------------|
| `search_reviews` | Search 23 music publications (Pitchfork, The Quietus, Resident Advisor, AllMusic, Bandcamp Daily, etc.) for album/artist reviews. Uses Tavily advanced depth + Exa findSimilar for related review discovery |
| `extract_influences` | Extract artist co-mentions from review text using heuristic name extraction and influence phrase detection |
| `trace_influence_path` | Find a chain of influence between two artists (depth 1–5) with evidence for each link. Tavily advanced for direct paths, Exa neural for neighborhood exploration |
| `find_bridge_artists` | Find artists that connect two genres or scenes, scored by cross-genre co-mention density. Uses Exa neural search for crossover discovery |

### Influence Cache (always available)

Persistent local SQLite cache that stores every discovered influence relationship. The graph grows organically over time — the agent checks cache before making expensive web searches.

| Tool | What it does |
|------|-------------|
| `cache_influence` | Save a single influence edge with evidence. Upserts: repeated discoveries strengthen weight, never weaken it |
| `cache_batch_influences` | Save multiple edges in one transaction (after extracting co-mentions from a review) |
| `lookup_influences` | Query cached neighbors by artist, direction, relationship type, minimum weight |
| `find_cached_path` | BFS shortest path between two cached artists — instant, no web searches |
| `search_cached_artists` | Search cached artist names with connection counts |
| `influence_graph_stats` | Graph totals, breakdowns by relationship/source type, most-connected artists |
| `add_artist_alias` | Register alternate names (e.g. "DOOM" → "MF DOOM", "Ye" → "Kanye West") |
| `remove_cached_edge` | Delete incorrect edges by ID |

See **[docs/INFLUENCE-NETWORK.md](docs/INFLUENCE-NETWORK.md)** for the full deep-dive: research foundation, algorithms, architecture, and how these features compare to streaming service recommendations.

### Telegraph (always available)

Publish your research as shareable web pages via [Telegraph](https://telegra.ph/) — Telegram's anonymous publishing platform. No API key, no account required.

| Tool | What it does |
|------|-------------|
| `setup_telegraph_page` | Create your Crate social page — a public index of everything you publish |
| `post_to_telegraph` | Publish an entry (influence chain, artist profile, playlist) to your page |
| `view_telegraph_page` | View your page and all published entries |
| `list_telegraph_entries` | List all entries with titles, categories, and URLs |
| `delete_telegraph_entry` | Remove an entry from your page |

### Tumblr (requires `TUMBLR_CONSUMER_KEY` + `TUMBLR_CONSUMER_SECRET`)

Publish your music research to your Tumblr blog. Markdown content is automatically converted to Tumblr's NPF (Neue Post Format) with full formatting support — headings, bold, italic, links, lists, blockquotes, and code blocks. Posts are auto-tagged with `crate` + `music` and an optional category.

| Tool | What it does |
|------|-------------|
| `connect_tumblr` | One-time OAuth 1.0a setup — opens your browser to authorize Crate. Supports multi-blog accounts |
| `post_to_tumblr` | Publish a post with markdown content, tags, and category (influence, artist, playlist, collection, note) |
| `tumblr_blog_info` | View your connected blog details and recent posts |
| `disconnect_tumblr` | Remove stored credentials (post history is preserved) |
| `tumblr_status` | Check if Tumblr is connected |

To set up Tumblr publishing:
1. Register an app at [tumblr.com/oauth/apps](https://www.tumblr.com/oauth/apps)
2. Set `TUMBLR_CONSUMER_KEY` and `TUMBLR_CONSUMER_SECRET` in your `.env`
3. In Crate, ask the agent to connect to Tumblr — it will open your browser for OAuth authorization

### Browser (requires `KERNEL_API_KEY`)

Cloud browser powered by [Kernel.sh](https://onkernel.com/) for reading full articles, scraping dynamic pages, and capturing screenshots from sources that block simple HTTP requests (Pitchfork, RateYourMusic, Resident Advisor, etc.).

| Tool | What it does |
|------|-------------|
| `browse_url` | Navigate to a URL and extract page content — article text, title, and metadata |
| `screenshot_url` | Take a screenshot of a web page, full page or specific CSS selector |

The agent automatically uses the browser as a fallback when standard HTTP fetches fail due to anti-bot protection or JavaScript-rendered content.

## Quick Start

### Prerequisites

- Node.js 20+
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) + [mpv](https://mpv.io/) — for audio playback (optional)

```bash
# macOS
brew install yt-dlp mpv

# Linux
sudo apt install yt-dlp mpv    # or your package manager
```

### Install

```bash
npm install -g crate-cli
crate
```

**Or try without installing:**

```bash
npx crate-cli
```

**Or clone for development:**

```bash
git clone https://github.com/tmoody1973/crate-cli.git
cd crate-cli
npm install
npm run dev
```

The built-in setup wizard walks you through API key configuration on first run — no manual `.env` editing needed.

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

## MCP Server Mode

Crate can run as a standard [MCP](https://modelcontextprotocol.io/) stdio server, exposing all 95 music research tools to any MCP-compatible client — Claude Desktop, Cursor, OpenClaw, and more.

```bash
# Via CLI flag
crate --mcp-server

# Via dedicated binary
crate-mcp

# Via npx
npx crate-cli --mcp-server
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "crate-music-research": {
      "command": "npx",
      "args": ["-y", "crate-cli", "--mcp-server"],
      "env": {
        "DISCOGS_KEY": "your-key",
        "DISCOGS_SECRET": "your-secret",
        "LASTFM_API_KEY": "your-key",
        "GENIUS_ACCESS_TOKEN": "your-token"
      }
    }
  }
}
```

### Cursor / OpenClaw

```json
{
  "mcpServers": {
    "crate-music-research": {
      "command": "npx",
      "args": ["-y", "crate-cli", "--mcp-server"]
    }
  }
}
```

Tools are prefixed by server name (e.g. `musicbrainz_search_artist`, `bandcamp_get_album`, `influence_trace_influence_path`). Only servers with configured API keys are exposed — see [Environment Variables](#environment-variables).

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

### News

| Command | Description |
|---------|-------------|
| `/news [count]` | Generate daily music news segment (1–5 stories) |

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
| `TUMBLR_CONSUMER_KEY` | Tumblr OAuth consumer key | No |
| `TUMBLR_CONSUMER_SECRET` | Tumblr OAuth consumer secret | No |
| `KERNEL_API_KEY` | Cloud browser for anti-bot bypass ([Kernel.sh](https://onkernel.com/)) | No |
| `TICKETMASTER_API_KEY` | Live event and concert discovery | No |

All keys can be managed interactively from within Crate using the `/keys` command — no need to edit `.env` manually.

## Project Structure

```
crate-cli/
├── src/
│   ├── cli.ts                 # Entry point, arg parsing
│   ├── mcp-server.ts          # MCP stdio server entry point
│   ├── agent/
│   │   ├── index.ts           # CrateAgent class (wraps Claude Agent SDK)
│   │   └── system-prompt.ts   # Agent personality and tool docs
│   ├── servers/
│   │   ├── index.ts           # Server registry (key-gated activation)
│   │   ├── tool-registry.ts   # Tool aggregator for MCP server mode
│   │   ├── musicbrainz.ts     # MusicBrainz MCP server (6 tools)
│   │   ├── discogs.ts         # Discogs MCP server (9 tools)
│   │   ├── genius.ts          # Genius MCP server (6 tools)
│   │   ├── lastfm.ts          # Last.fm MCP server (8 tools)
│   │   ├── wikipedia.ts       # Wikipedia MCP server (3 tools)
│   │   ├── bandcamp.ts        # Bandcamp MCP server (8 tools)
│   │   ├── youtube.ts         # YouTube player MCP server (4 tools)
│   │   ├── radio.ts           # Radio Browser MCP server (4 tools)
│   │   ├── news.ts            # News / RSS MCP server (3 tools, 10 feeds)
│   │   ├── web-search.ts      # Web search MCP server (3 tools, Tavily + Exa)
│   │   ├── influence.ts       # Influence network MCP server (4 tools, review co-mentions)
│   │   ├── influence-cache.ts # Influence cache MCP server (8 tools, local SQLite)
│   │   ├── telegraph.ts       # Telegraph publishing (5 tools, anonymous pages)
│   │   ├── tumblr.ts          # Tumblr publishing (5 tools, OAuth 1.0a, NPF)
│   │   ├── browser.ts         # Cloud browser (2 tools, Kernel.sh + Playwright)
│   │   ├── collection.ts      # Local collection manager (SQLite)
│   │   ├── playlist.ts        # Playlist manager (SQLite)
│   │   └── memory.ts          # Mem0 persistent memory
│   ├── ui/
│   │   ├── app.ts             # TUI setup, slash commands, progress display
│   │   ├── components.ts      # Themes, banner, hyperlinks
│   │   ├── keys-panel.ts      # Interactive API key management (/keys)
│   │   ├── now-playing.ts     # Now-playing bar overlay
│   │   └── onboarding.ts      # First-run onboarding flow
│   └── utils/
│       ├── config.ts          # Model resolution, env config
│       ├── db.ts              # SQLite database utility (~/.crate/*.db)
│       ├── env.ts             # .env file read/write utilities
│       ├── hints.ts           # Contextual hint engine
│       ├── player.ts          # Shared mpv player infrastructure
│       └── viz.ts             # Terminal visualizations (influence paths, charts)
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

## Security

- All external API calls use HTTPS with 15-second `AbortController` timeouts
- API keys are loaded from environment variables — never hardcoded
- All tool string inputs have `maxLength` validation via Zod schemas
- Radio stream URLs are validated for HTTP/HTTPS before passing to mpv
- `execFileSync` with array arguments is used for subprocess calls (prevents shell injection)
- Subprocess events use `once()` to prevent listener accumulation

## Development

```bash
npm run dev           # Start dev session
npm test              # Run tests
npm run test:watch    # Watch mode
npm run typecheck     # Type check without emitting
```

## License

MIT
