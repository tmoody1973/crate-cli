# Configuration

This is the canonical setup and configuration guide for Crate.

## Prerequisites

- Node.js 20+
- Optional: `yt-dlp` and `mpv` for playback

```bash
# macOS
brew install yt-dlp mpv

# Linux
sudo apt install yt-dlp mpv
```

## Install Options

### Global Install

```bash
npm install -g crate-cli
crate
```

### One-Off Run

```bash
npx crate-cli
```

### Local Development

```bash
git clone https://github.com/tmoody1973/crate-cli.git
cd crate-cli
npm install
npm run dev
```

## Models

Crate accepts model aliases at startup:

- `haiku` - default, quickest responses
- `sonnet` - stronger general-purpose reasoning
- `opus` - slower, deeper research sessions

Examples:

```bash
npx tsx src/cli.ts --model haiku
npx tsx src/cli.ts --model sonnet
npx tsx src/cli.ts --model opus
```

## API Keys

### Required

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Required for the Claude agent |

### Shared Fallback Keys Built In

These services work out of the box because Crate ships with shared fallback keys:

- `DISCOGS_KEY` / `DISCOGS_SECRET`
- `LASTFM_API_KEY`
- `TICKETMASTER_API_KEY`

Providing your own key overrides the shared fallback and is the better option for reliability and rate-limit isolation.

### Bring Your Own Key

| Variable | Enables |
|----------|---------|
| `GENIUS_ACCESS_TOKEN` | Genius |
| `MEM0_API_KEY` | Mem0 memory |
| `TAVILY_API_KEY` | Tavily web search |
| `EXA_API_KEY` | Exa semantic search |
| `YOUTUBE_API_KEY` | richer YouTube search metadata |
| `TUMBLR_CONSUMER_KEY` | Tumblr |
| `TUMBLR_CONSUMER_SECRET` | Tumblr |
| `KERNEL_API_KEY` | Browser and WhoSampled |

Keys can also be managed interactively through the `/keys` flow in the terminal UI.

## CLI Commands

Crate's slash commands are currently:

### Player

- `/play <query>`
- `/pause`
- `/next`
- `/prev`
- `/stop`
- `/vol [0-150]`
- `/np`

### Library And Social

- `/collection`
- `/playlists`
- `/mypage`
- `/entries [category]`

### Session

- `/news [count]`
- `/model [name]`
- `/cost`
- `/servers`
- `/keys`
- `/clear`
- `/help`
- `/quit`

## Local State

Crate stores local state under `~/.crate/`, including:

- feature databases (`*.db`)
- scratchpad session logs (`~/.crate/scratchpad/`)

These are local implementation details, but they matter for debugging and test cleanup.

## Related Docs

- [MCP.md](MCP.md) for MCP client setup
- [DEVELOPMENT.md](DEVELOPMENT.md) for contributor workflows
- [ARCHITECTURE.md](ARCHITECTURE.md) for the runtime model
