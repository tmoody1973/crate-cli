# Crate

> AI-powered music research agent for the terminal

Crate is a CLI tool that helps DJs, record collectors, music journalists, and serious listeners research music in depth. It uses Claude as an AI agent with direct access to multiple music databases, returning structured, cross-referenced results in a rich terminal UI.

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

## Data Sources

| Source | Tools | API Key Required |
|--------|-------|------------------|
| **MusicBrainz** | 6 (artist, release, recording search + details) | No |
| **Wikipedia** | 3 (search, summary, full article) | No |
| **Discogs** | 10 (search, artist, release, label, master, marketplace) | Yes |
| **Last.fm** | 8 (artist/album/track stats, similar artists, tags, geo) | Yes |
| **Genius** | 6 (song search, annotations, artist info) | Yes |

MusicBrainz and Wikipedia are always available. The others activate automatically when you provide their API keys.

Wikipedia supports optional [Wikimedia Enterprise](https://enterprise.wikimedia.com/) credentials for richer article content, with automatic fallback to free endpoints.

## Quick Start

### Prerequisites

- Node.js 20+
- npm
- An [Anthropic API key](https://console.anthropic.com/)

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

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude | Yes |
| `DISCOGS_KEY` | Discogs API consumer key | No |
| `DISCOGS_SECRET` | Discogs API consumer secret | No |
| `LASTFM_API_KEY` | Last.fm API key | No |
| `GENIUS_ACCESS_TOKEN` | Genius API access token | No |
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
│   │   ├── discogs.ts         # Discogs MCP server (10 tools)
│   │   ├── genius.ts          # Genius MCP server (6 tools)
│   │   ├── lastfm.ts          # Last.fm MCP server (8 tools)
│   │   └── wikipedia.ts       # Wikipedia MCP server (3 tools)
│   ├── ui/
│   │   ├── app.ts             # TUI setup (pi-tui)
│   │   └── components.ts      # Themes, banner, hyperlinks
│   └── utils/
│       └── config.ts          # Model resolution, env config
├── tests/
│   └── wikipedia.test.ts      # Wikipedia server tests
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
