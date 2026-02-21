# Crate

> AI-powered music research agent for the terminal

Crate is a CLI tool that helps DJs, record collectors, music journalists, and serious listeners research music in depth. It uses Claude as an AI agent with direct access to multiple music databases, returning structured, cross-referenced results in a rich terminal UI — with built-in audio playback.

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
| **Bandcamp** | 6 (search, artist, album, discover, tags, editorial) | No |
| **YouTube** | 4 (search, play track, play playlist, player control) | No* |
| **Discogs** | 9 (search, artist, release, label, master, marketplace) | Yes |
| **Last.fm** | 8 (artist/album/track stats, similar artists, tags, geo) | Yes |
| **Genius** | 6 (song search, annotations, artist info) | Yes |

MusicBrainz, Wikipedia, Bandcamp, and YouTube are always available. The others activate automatically when you provide their API keys.

*YouTube search works without a key via yt-dlp scraping. Set `YOUTUBE_API_KEY` for faster, richer search results.

Wikipedia supports optional [Wikimedia Enterprise](https://enterprise.wikimedia.com/) credentials for richer article content, with automatic fallback to free endpoints.

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
| `YOUTUBE_API_KEY` | YouTube Data API key (enhances search) | No |
| `WIKIMEDIA_USERNAME` | Wikimedia Enterprise username | No |
| `WIKIMEDIA_PASSWORD` | Wikimedia Enterprise password | No |

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
│   │   └── youtube.ts         # YouTube player MCP server (4 tools)
│   ├── ui/
│   │   ├── app.ts             # TUI setup, slash commands
│   │   ├── components.ts      # Themes, banner, hyperlinks
│   │   └── now-playing.ts     # Now-playing bar overlay
│   └── utils/
│       └── config.ts          # Model resolution, env config
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
