# MCP Server Mode

Crate can run as a standard stdio MCP server.

## Start The Server

Any of these entrypoints work:

```bash
crate --mcp-server
crate-mcp
npx crate-cli --mcp-server
```

## Tool Exposure

Tools are exposed with a server-prefixed name such as:

- `musicbrainz_search_artist`
- `bandcamp_get_album`
- `influence_trace_influence_path`

Only active servers are exposed. That means:

- always-on servers are always available
- Discogs, Last.fm, and Ticketmaster can still appear with no user setup because of shared fallback keys
- BYOK integrations only appear when the relevant key is available

The canonical activation rules live in [CONFIGURATION.md](CONFIGURATION.md).

## Claude Desktop Example

Add this to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "crate-music-research": {
      "command": "npx",
      "args": ["-y", "crate-cli", "--mcp-server"],
      "env": {
        "GENIUS_ACCESS_TOKEN": "your-token",
        "KERNEL_API_KEY": "your-kernel-key"
      }
    }
  }
}
```

## Cursor / OpenClaw Example

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

## Notes For Maintainers

- MCP mode currently builds its tool list through `src/servers/tool-registry.ts`.
- The interactive agent uses `src/servers/index.ts`.
- Any server activation change should update both code paths until they are unified.
