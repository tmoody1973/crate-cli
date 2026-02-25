# OpenClaw Integration Plan for Crate

> Bring Crate's 92 music research tools to the most popular open-source AI agent platform.

**Status:** Proposed
**Date:** 2026-02-25
**Dependency:** [OpenClaw](https://openclaw.ai/) — open-source self-hosted AI agent framework (191K+ GitHub stars)

---

## The Opportunity

OpenClaw is the leading open-source autonomous AI agent platform. It runs on users' own devices, connects to LLMs (Claude, GPT, DeepSeek), and operates across WhatsApp, Telegram, Slack, Discord, Signal, iMessage, and more. It has **native MCP (Model Context Protocol) support** — the same protocol Crate already builds on.

This means Crate's music research capabilities can be exposed to any OpenClaw user with minimal engineering work. Someone could message their OpenClaw agent on WhatsApp: *"trace the influence from Fela Kuti to Beyoncé"* — and get Crate's full research-grade results with citations.

**Why this matters for Crate:**
- **Distribution**: 191K+ GitHub stars, massive active user base
- **Cross-platform reach**: Crate's tools accessible from any messaging platform OpenClaw supports
- **Zero friction**: Users add one config block and get all 92 tools
- **Ecosystem visibility**: Listed on ClawHub (700+ skills) and MCP server directories
- **Positioning**: Establishes Crate as the music research layer for the AI agent ecosystem

---

## Integration Strategy

Three complementary layers, each building on the previous:

### Layer 1: MCP Server Mode (Primary — highest impact, lowest effort)
Expose all of Crate's MCP servers as a standalone stdio MCP server process that any MCP client (OpenClaw, Claude Desktop, Cursor, etc.) can consume.

### Layer 2: ClawHub Skill (Discovery — gets Crate in front of OpenClaw users)
Publish a `SKILL.md` to ClawHub that teaches OpenClaw agents how to use Crate's tools effectively for music research workflows.

### Layer 3: OpenClaw Plugin (Optional — deepest integration)
A TypeScript plugin that registers Crate's tools directly into OpenClaw's tool registry with lifecycle hooks, slash commands, and background services.

---

## Layer 1: MCP Server Mode

### What It Does

Adds a `--mcp-server` flag to the `crate` CLI that starts all configured MCP servers as a single stdio MCP server process, speaking the standard MCP JSON-RPC 2.0 protocol over stdin/stdout.

### User Experience

**For OpenClaw users**, add to `openclaw.json`:

```json
{
  "mcpServers": {
    "crate": {
      "command": "npx",
      "args": ["-y", "crate-cli", "--mcp-server"],
      "env": {
        "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}",
        "LASTFM_API_KEY": "${LASTFM_API_KEY}",
        "GENIUS_ACCESS_TOKEN": "${GENIUS_ACCESS_TOKEN}",
        "DISCOGS_KEY": "${DISCOGS_KEY}",
        "DISCOGS_SECRET": "${DISCOGS_SECRET}"
      }
    }
  }
}
```

**For Claude Desktop users**, add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "crate": {
      "command": "npx",
      "args": ["-y", "crate-cli", "--mcp-server"]
    }
  }
}
```

**For any MCP client**, the pattern is the same: `npx -y crate-cli --mcp-server`.

### Technical Implementation

#### New file: `src/mcp-server.ts`

Entry point for MCP server mode. Bridges Crate's in-process `createSdkMcpServer()` servers to the standard `@modelcontextprotocol/sdk` stdio transport.

```
src/mcp-server.ts
├── Import all server modules from src/servers/
├── Enumerate tools from each active server
├── Register each tool with @modelcontextprotocol/sdk McpServer
├── Connect via StdioServerTransport (stdin/stdout)
└── Handle graceful shutdown
```

#### Architecture

```
OpenClaw Gateway / Claude Desktop / Any MCP Client
        │
        │ JSON-RPC 2.0 over stdio
        ▼
┌─────────────────────────┐
│   crate --mcp-server    │
│   (src/mcp-server.ts)   │
│                         │
│   McpServer instance    │
│   ├── musicbrainz_*     │  ← 6 tools
│   ├── bandcamp_*        │  ← 7 tools
│   ├── discogs_*         │  ← 9 tools
│   ├── genius_*          │  ← 8 tools
│   ├── lastfm_*          │  ← 7 tools
│   ├── youtube_*         │  ← 6 tools
│   ├── wikipedia_*       │  ← 3 tools
│   ├── influence_*       │  ← 3 tools
│   ├── influencecache_*  │  ← 8 tools
│   ├── collection_*      │  ← 5 tools
│   ├── playlist_*        │  ← varies
│   ├── websearch_*       │  ← 4 tools
│   ├── telegraph_*       │  ← 5 tools
│   ├── tumblr_*          │  ← 5 tools
│   ├── radio_*           │  ← varies
│   └── news_*            │  ← varies
│                         │
│   StdioServerTransport  │
└─────────────────────────┘
        │
        ▼
  MusicBrainz, Discogs, Genius, Last.fm,
  Bandcamp, YouTube, Wikipedia, Tavily,
  Exa, Ticketmaster, Telegraph, Tumblr...
```

#### Key Design Decisions

**Tool naming**: Prefix each tool with its server name to avoid collisions:
- `musicbrainz_search_artist`
- `discogs_get_release`
- `genius_search_songs`
- `influence_trace_path`

This matches how OpenClaw prefixes MCP tools when `toolPrefix` is enabled.

**Server selection**: Use the same `getActiveServers()` logic from `src/servers/index.ts`. Tools are gated by the same environment variables — if a user doesn't provide `DISCOGS_KEY`, the Discogs tools simply won't be registered.

**No TUI**: MCP server mode skips the entire pi-tui rendering stack. No `createApp()`, no streaming markdown, no editor input. Pure tool server.

**No agent loop**: The MCP server exposes raw tools, not the CrateAgent orchestration. The host application (OpenClaw, Claude Desktop) provides its own agent loop. Crate's tools are building blocks, not a complete agent.

#### Changes Required

| File | Change |
|------|--------|
| `src/mcp-server.ts` | **New** — MCP server entry point |
| `src/cli.ts` | Add `--mcp-server` flag parsing, route to `mcp-server.ts` |
| `package.json` | Add `@modelcontextprotocol/sdk` dependency, add `bin.crate-mcp` |
| `tsconfig.json` | Ensure `src/mcp-server.ts` is included in build |

#### Implementation

```typescript
// src/mcp-server.ts
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getActiveServers } from "./servers/index.js";

async function main() {
  const server = new McpServer({
    name: "crate-music-research",
    version: "0.2.2",
  });

  const activeServers = getActiveServers();

  // For each active server, extract its tools and register them
  // with the MCP server under prefixed names
  for (const [serverName, serverInstance] of Object.entries(activeServers)) {
    const tools = serverInstance.getTools(); // Need to expose this
    for (const [toolName, toolDef] of Object.entries(tools)) {
      server.tool(
        `${serverName}_${toolName}`,
        toolDef.description,
        toolDef.schema,
        toolDef.handler
      );
    }
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Crate MCP server failed to start:", err);
  process.exit(1);
});
```

> **Note**: The exact bridging code depends on how `createSdkMcpServer()` exposes tool definitions internally. We may need to add a `getTools()` method to each server or extract tools before wrapping them. This is the main engineering challenge — bridging the Claude Agent SDK's in-process MCP format to the standard `@modelcontextprotocol/sdk` stdio format.

---

## Layer 2: ClawHub Skill

### What It Does

Publishes a skill to ClawHub that provides OpenClaw agents with domain-specific guidance for music research using Crate's MCP tools.

### Why Both MCP + Skill?

MCP tools give the agent *capabilities* (callable functions). The skill gives the agent *knowledge* about how to use those capabilities effectively — research workflows, tool chaining patterns, and music domain expertise.

### Skill: `music-research`

```markdown
---
name: music-research
description: Deep music research using Crate — 92 tools across 17 data sources
version: 1.0.0
requires:
  mcp_servers: ["crate"]
tags:
  - music
  - research
  - influence
  - discography
  - vinyl
---

# Music Research with Crate

You have access to Crate's music research tools via MCP. These tools connect to
17 real music databases and 26 publications. Use them to answer music questions
with verified, cited data.

## Research Workflows

### Artist Research
1. Start with `musicbrainz_search_artist` to get the canonical artist ID
2. Use `genius_get_artist` for bio, aliases, and social links
3. Use `lastfm_get_artist_info` for listening stats and similar artists
4. Use `discogs_search_artist` for discography and label history
5. Use `bandcamp_search` for independent releases
6. Use `wikipedia_search` for biographical context

### Influence Tracing
1. Use `influence_trace_influence` to find connections between two artists
2. Results include publication, critic, date, and URL for every connection
3. Use `influencecache_get_path` for cached paths (instant results)
4. Always cite the publication and review when presenting influence connections

### Track Verification
CRITICAL: Never invent track names. Always verify tracks exist before including them:
1. Use `bandcamp_get_artist_tracks` for independent artists
2. Use `musicbrainz_search_recording` for mainstream releases
3. Use `youtube_search` as a fallback verification source

### Vinyl & Collecting
1. Use `discogs_get_release` for pressing details, labels, and catalog numbers
2. Use `discogs_get_master_release` for all versions of an album
3. Use `collection_*` tools to manage the user's personal collection

### Publishing Research
1. Use `telegraph_*` tools to publish research as shareable web pages
2. Use `tumblr_*` tools to post to the user's Tumblr blog
3. Always include citations and source links in published research

## Important Rules
- Every claim must be backed by a real data source — never hallucinate
- When presenting influence connections, always include: publication, critic, date, URL
- Verify tracks against real databases before including in playlists
- Use multiple sources to cross-reference facts
- The influence system searches 26 music publications including Pitchfork, The Wire,
  Resident Advisor, Stereogum, The Guardian, NPR, and more
```

### Publishing to ClawHub

```bash
clawhub login
clawhub publish ./skills/music-research \
  --slug "crate-music-research" \
  --name "Music Research (Crate)" \
  --version "1.0.0" \
  --changelog "Initial release — 92 tools, 17 sources, influence tracing" \
  --tags "latest"
```

---

## Layer 3: OpenClaw Plugin (Future)

### What It Does

A full TypeScript plugin (`@crate/openclaw-plugin`) that registers Crate's tools directly into OpenClaw's tool registry, adds slash commands, and provides background services.

### When to Build This

After Layer 1 (MCP server) and Layer 2 (ClawHub skill) are shipped and validated by users. The plugin adds:

- **Slash commands**: `/crate search <query>`, `/crate influence <artist A> <artist B>`, `/crate play <query>`
- **Background indexing**: Periodically refresh the influence cache
- **Channel-specific formatting**: Format results differently for WhatsApp vs Slack vs Discord
- **Memory integration**: Store user's music preferences in OpenClaw's memory system

### Plugin Structure

```
@crate/openclaw-plugin/
├── package.json
│   └── openclaw.extensions: { type: "tool", entry: "./dist/index.js" }
├── openclaw.plugin.json
│   └── configSchema for API keys
├── src/
│   ├── index.ts          — register(api) entry point
│   ├── tools.ts          — Bridge Crate servers to OpenClaw tool registry
│   └── commands.ts       — Slash command handlers
└── skills/
    └── music-research/
        └── SKILL.md      — Bundled skill
```

### Installation

```bash
openclaw plugins install @crate/openclaw-plugin
```

---

## Implementation Phases

### Phase 1: MCP Server Mode (Week 1)

- [ ] Add `@modelcontextprotocol/sdk` as a dependency
- [ ] Create `src/mcp-server.ts` — stdio MCP server entry point
- [ ] Bridge `createSdkMcpServer()` tool definitions to `@modelcontextprotocol/sdk` format
- [ ] Add `--mcp-server` flag to `src/cli.ts`
- [ ] Add `"crate-mcp": "dist/mcp-server.js"` to `package.json` bin field
- [ ] Test with MCP Inspector: `npx @modelcontextprotocol/inspector node dist/mcp-server.js`
- [ ] Test with Claude Desktop configuration
- [ ] Update README with MCP server documentation
- [ ] Publish updated npm package

### Phase 2: ClawHub Skill (Week 1-2)

- [ ] Create `skills/music-research/SKILL.md` with research workflows
- [ ] Test skill locally in OpenClaw workspace
- [ ] Create ClawHub account and authenticate
- [ ] Publish to ClawHub as `crate-music-research`
- [ ] Add ClawHub badge to README and landing page

### Phase 3: OpenClaw Plugin (Week 3-4, if validated)

- [ ] Create `@crate/openclaw-plugin` package
- [ ] Implement `register(api)` with tool bridging
- [ ] Add slash commands (`/crate search`, `/crate influence`, `/crate play`)
- [ ] Channel-specific result formatting
- [ ] Publish to npm
- [ ] Submit to OpenClaw's official extensions list

### Phase 4: Documentation & Launch (Week 2-4)

- [ ] Add "Works with OpenClaw" section to landing page
- [ ] Create `docs/openclaw.md` setup guide
- [ ] Add to Product Hunt launch materials
- [ ] Post on OpenClaw community (Discord/GitHub Discussions)
- [ ] Cross-promote on X and LinkedIn

---

## Technical Challenges

### Challenge 1: Bridging SDK Formats

Crate uses `createSdkMcpServer()` from `@anthropic-ai/claude-agent-sdk`, which creates in-process MCP servers. The standalone MCP server mode needs to use `@modelcontextprotocol/sdk` for stdio transport.

**Options:**
1. **Extract tool definitions** from each server module and re-register them with `@modelcontextprotocol/sdk`. Requires exposing tool metadata from each server.
2. **Dual registration** — each server module exports both the in-process server and a tool definition map.
3. **Adapter layer** — run the SDK MCP servers in-process and proxy calls through the stdio transport.

**Recommended**: Option 2 (dual registration). Each server already defines tools with `tool()` + Zod. Export the tool definitions alongside the server instance so `mcp-server.ts` can register them with either SDK.

### Challenge 2: Audio Playback

Crate's `youtube` and `radio` servers include audio playback tools (`play_track`, `play_radio`) that require `mpv` and `yt-dlp` on the host machine. In MCP server mode:

- These tools should still be registered (the host machine may have mpv/yt-dlp)
- Playback happens on the machine running `crate --mcp-server`, which is correct for self-hosted OpenClaw
- For remote OpenClaw setups, playback tools should gracefully fail with an informative message

### Challenge 3: Tool Count

92 tools is a lot for a single MCP server. Some MCP clients may struggle with the system prompt size.

**Mitigation:**
- Add a `--tools` flag to filter which servers are exposed: `crate --mcp-server --tools musicbrainz,genius,influence`
- Default to all active servers
- Document which tools are most useful for different use cases

---

## Impact Summary

| Metric | Current | With OpenClaw Integration |
|--------|---------|--------------------------|
| Accessible from | Terminal only | Terminal + WhatsApp + Telegram + Slack + Discord + Signal + iMessage + web |
| User base | npm installs | npm installs + 191K+ OpenClaw users |
| Discovery | crate-cli.dev, npm, GitHub | + ClawHub, OpenClaw docs, MCP directories |
| Agent capabilities | Crate's CrateAgent only | Any LLM via any MCP client |
| Cross-platform | macOS/Linux/Windows terminal | Every platform OpenClaw runs on |

### Positioning Upgrade

**Before:** "Install Crate and use it in your terminal"
**After:** "Crate's music research tools work everywhere — in your terminal, through OpenClaw on WhatsApp, in Claude Desktop, or any MCP-compatible agent"

---

## Dependencies

- `@modelcontextprotocol/sdk` — Standard MCP TypeScript SDK (v1.25.3+)
- Existing: all current Crate dependencies (Zod, better-sqlite3, cheerio, etc.)
- `clawhub` CLI — for publishing skills (dev dependency only)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| 92 tools overwhelm the host agent's context | Add `--tools` filter flag; document recommended subsets |
| API keys leak through MCP server | Keys passed via `env` in consumer config; never logged to stdout |
| Tool naming collisions | Prefix all tools with server name (`musicbrainz_`, `genius_`, etc.) |
| OpenClaw API changes | MCP is a stable protocol; stdio transport is unlikely to change |
| ClawHub skill becomes stale | Version skill alongside npm releases; CI publishes both |
| Audio playback doesn't work remotely | Graceful error messages; document local-only requirement |

---

## References

- [OpenClaw](https://openclaw.ai/) — Official website
- [OpenClaw GitHub](https://github.com/openclaw/openclaw) — 191K+ stars
- [OpenClaw Docs](https://docs.openclaw.ai/) — Configuration, plugins, skills
- [ClawHub](https://github.com/openclaw/clawhub) — Skill registry (700+ skills)
- [OpenClaw MCP Support](https://docs.openclaw.ai/gateway/configuration#mcp) — Native MCP configuration
- [OpenClaw Plugin Docs](https://docs.openclaw.ai/tools/plugin) — Plugin development guide
- [MCP Protocol Spec](https://modelcontextprotocol.io/) — Model Context Protocol specification
- [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk) — TypeScript SDK
- [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) — Testing tool
