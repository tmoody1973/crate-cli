# Crate

> AI-powered music research agent for the terminal

Crate is a terminal-first music research tool and MCP server. It lets Claude investigate artists, releases, labels, scenes, and influence chains across multiple music sources, then play music while you work.

## What Crate Does

- Cross-references music data instead of relying on one API or model memory
- Plays tracks, playlists, and radio streams directly from the terminal
- Stores local research context with collections, playlists, an influence cache, and scratchpad logs
- Exposes its tools over MCP so other AI clients can use the same research stack

## Example Prompts

```text
Who produced Madvillainy?

Trace the influence path from Kraftwerk to Radiohead.

I have a copy of Kind of Blue on Columbia with a 6-eye label.
What pressing is this, what is it worth, and how do I verify it?

Build me a playlist of spiritual jazz records that were sampled in 90s hip-hop,
and verify every track before you add it.
```

More real workflows live in [docs/USE_CASES.md](docs/USE_CASES.md), [docs/WORKFLOWS.md](docs/WORKFLOWS.md), and [docs/CASE-STUDY.md](docs/CASE-STUDY.md).

## Quick Start

### Prerequisites

- Node.js 20+
- Optional: [yt-dlp](https://github.com/yt-dlp/yt-dlp) and [mpv](https://mpv.io/) for playback

```bash
# macOS
brew install yt-dlp mpv

# Linux
sudo apt install yt-dlp mpv
```

### Install

```bash
npm install -g crate-cli
crate
```

Or run it without installing:

```bash
npx crate-cli
```

For local development:

```bash
git clone https://github.com/tmoody1973/crate-cli.git
cd crate-cli
npm install
npm run dev
```

Crate defaults to Claude Haiku. You can also start with `sonnet` or `opus`:

```bash
npx tsx src/cli.ts --model sonnet
npx tsx src/cli.ts --model opus
```

Detailed setup, keys, commands, and environment variables live in [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

## Documentation

Start here:

- [docs/README.md](docs/README.md) - docs index and canonical sources
- [docs/CONFIGURATION.md](docs/CONFIGURATION.md) - install, models, commands, keys, local data
- [docs/MCP.md](docs/MCP.md) - MCP server mode and client setup
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) - repo layout, workflows, and docs maintenance
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - actual runtime architecture
- [docs/PRD.md](docs/PRD.md) - current product framing

Reference and research docs:

- [docs/INFLUENCE-NETWORK.md](docs/INFLUENCE-NETWORK.md)
- [docs/USE_CASES.md](docs/USE_CASES.md)
- [docs/WORKFLOWS.md](docs/WORKFLOWS.md)
- [docs/CASE-STUDY.md](docs/CASE-STUDY.md)

## Data Sources At A Glance

Always-on sources:

- MusicBrainz, Wikipedia, Bandcamp, YouTube, Radio Browser, News/RSS
- Collection, Playlist, Influence Cache, Telegraph, iTunes

Available out of the box via shared fallback keys:

- Discogs, Last.fm, Ticketmaster

Bring your own key:

- Genius, Mem0, Tavily, Exa, Tumblr, Kernel.sh
- Kernel enables both Browser and WhoSampled

The canonical key matrix is in [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

## MCP Server Mode

Crate can run as a standard MCP stdio server for Claude Desktop, Cursor, OpenClaw, and other MCP-compatible clients:

```bash
crate --mcp-server
crate-mcp
npx crate-cli --mcp-server
```

Setup examples and behavior notes are in [docs/MCP.md](docs/MCP.md).

## Repository Layout

This repo has two main workspaces:

- `src/` - the CLI, agent loop, servers, and tests
- `www/` - the Next.js marketing/demo site

Development commands and repo conventions are documented in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) and [www/README.md](www/README.md).

## License

MIT
