# Discogs MCP Server Design

## Summary

Add a Discogs MCP server to Crate CLI with 9 tools covering artist profiles, discographies, labels, master releases, full release details, marketplace stats, and database search. This is the second data source after MusicBrainz, focusing on vinyl/physical release data, detailed credits, and marketplace pricing.

## Decisions

- **Scope**: Discogs server only. Audio analysis (SoundStat.info, Songstats) deferred to a separate iteration.
- **Approach**: Mirror the MusicBrainz server pattern — single file, rate limiting, Zod schemas, exported handlers for testing.
- **Auth**: Consumer Key + Consumer Secret (OAuth 1.0a credentials used in simple mode, no OAuth dance). Header format: `Authorization: Discogs key=<KEY>, secret=<SECRET>`.
- **Env vars**: `DISCOGS_KEY` and `DISCOGS_SECRET` (replaces the planned `DISCOGS_TOKEN`).
- **All 9 endpoints** from the PRD implemented in this iteration.

## Architecture

### File Structure

```
src/servers/discogs.ts        # New — Discogs MCP server (9 tools)
src/servers/index.ts           # Modified — register discogs server
src/ui/app.ts                  # Modified — tool progress messages
src/agent/system-prompt.ts     # Modified — Discogs capabilities
src/utils/config.ts            # Modified — update KEY_GATED_SERVERS
tests/discogs.test.ts          # New — handler unit tests
```

### Auth & Rate Limiting

- Base URL: `https://api.discogs.com`
- Auth header: `Authorization: Discogs key=<DISCOGS_KEY>, secret=<DISCOGS_SECRET>`
- User-Agent: `CrateCLI/1.0 +https://github.com/user/crate-cli` (Discogs requires descriptive User-Agent)
- Rate limit: 60 requests/minute for authenticated users → 1 second minimum between requests
- Same `rateLimit()` pattern as MusicBrainz

### Internal Helpers

```typescript
// Rate limiter — 1 second between requests
let lastRequest = 0;
async function rateLimit(): Promise<void> { ... }

// Fetch wrapper with auth, rate limiting, error handling
async function discogsFetch(path: string, params?: Record<string, string>): Promise<any> { ... }

// Result helpers (same pattern as MusicBrainz)
function toolResult(data: unknown): ToolResult { ... }
function toolError(message: string): ToolResult { ... }
```

## Tools (9 total)

### 1. search_discogs
- **Endpoint**: `GET /database/search`
- **Params**: `query` (required), `type` (artist|release|master|label), `genre`, `style`, `country`, `year`, `per_page` (default 10)
- **Response shape**: `{ results: [{ id, type, title, year, thumb, resource_url }], pagination }`
- **Handler extracts**: id, type, title, year, country, label, format, thumb

### 2. get_artist_discogs
- **Endpoint**: `GET /artists/{artist_id}`
- **Params**: `artist_id` (required, number)
- **Response shape**: `{ id, name, profile, urls, images, members, aliases, realname, namevariations }`
- **Handler extracts**: id, name, realname, profile (truncated to 2000 chars), urls, members (name + id), aliases (name + id), images (first 3)

### 3. get_artist_releases
- **Endpoint**: `GET /artists/{artist_id}/releases`
- **Params**: `artist_id` (required), `sort` (year|title|format, default year), `sort_order` (asc|desc), `per_page` (default 25), `page`
- **Response shape**: `{ releases: [...], pagination }`
- **Handler extracts**: id, title, year, type, role, format, label, thumb

### 4. get_label
- **Endpoint**: `GET /labels/{label_id}`
- **Params**: `label_id` (required, number)
- **Response shape**: `{ id, name, profile, contact_info, urls, images, sublabels, parent_label }`
- **Handler extracts**: id, name, profile (truncated), contact_info, urls, sublabels (name + id), parent_label

### 5. get_label_releases
- **Endpoint**: `GET /labels/{label_id}/releases`
- **Params**: `label_id` (required), `per_page` (default 25), `page`
- **Response shape**: `{ releases: [...], pagination }`
- **Handler extracts**: id, title, year, artist, format, catno, thumb

### 6. get_master
- **Endpoint**: `GET /masters/{master_id}`
- **Params**: `master_id` (required, number)
- **Response shape**: `{ id, title, year, artists, genres, styles, tracklist, images, main_release, most_recent_release }`
- **Handler extracts**: id, title, year, artists, genres, styles, tracklist (position + title + duration), main_release, most_recent_release

### 7. get_master_versions
- **Endpoint**: `GET /masters/{master_id}/versions`
- **Params**: `master_id` (required), `per_page` (default 25), `page`
- **Response shape**: `{ versions: [...], pagination }`
- **Handler extracts**: id, title, year, country, format, label, catno, thumb

### 8. get_release_full
- **Endpoint**: `GET /releases/{release_id}`
- **Params**: `release_id` (required, number)
- **Response shape**: Full release object with tracklist, credits, formats, notes, identifiers, companies, etc.
- **Handler extracts**: id, title, year, artists, labels, formats, genres, styles, tracklist (position + title + duration + extraartists), notes (truncated), identifiers, companies

### 9. get_marketplace_stats
- **Endpoint**: `GET /marketplace/stats/{release_id}`
- **Params**: `release_id` (required, number)
- **Response shape**: `{ lowest_price, num_for_sale, blocked_from_sale }`
- **Handler extracts**: All fields as-is (small payload)

## UI Integration

Add to `getToolProgressMessage()` in `src/ui/app.ts`:

| Tool | Progress Message |
|------|-----------------|
| search_discogs | "Searching Discogs for '{query}'..." |
| get_artist_discogs | "Fetching artist profile from Discogs..." |
| get_artist_releases | "Loading artist discography from Discogs..." |
| get_label | "Fetching label profile from Discogs..." |
| get_label_releases | "Loading label catalog from Discogs..." |
| get_master | "Fetching master release from Discogs..." |
| get_master_versions | "Loading release versions from Discogs..." |
| get_release_full | "Fetching full release details from Discogs..." |
| get_marketplace_stats | "Checking marketplace prices on Discogs..." |

## System Prompt Update

Add to the system prompt that the agent has Discogs tools for:
- Vinyl/physical release data, pressings, and format details
- Detailed credits and tracklists
- Label information and catalogs (sublabels, parent labels)
- Marketplace pricing data (lowest, median, number for sale)
- Master releases (canonical versions across formats/pressings)

## Config Changes

Update `KEY_GATED_SERVERS` in `src/utils/config.ts`:
```typescript
discogs: ["DISCOGS_KEY", "DISCOGS_SECRET"],  // was: ["DISCOGS_TOKEN"]
```

## Discogs API Token Setup

To get Discogs API credentials:
1. Create a Discogs account at https://www.discogs.com/users/create
2. Go to https://www.discogs.com/settings/developers
3. Click "Generate new token" or register a new application
4. For application auth: note the Consumer Key and Consumer Secret
5. Set environment variables:
   ```bash
   export DISCOGS_KEY="your-consumer-key"
   export DISCOGS_SECRET="your-consumer-secret"
   ```

## Testing Strategy

- Unit tests for each handler function using mocked `discogsFetch`
- Test error cases (missing ID, 404, rate limit exceeded)
- Test response shaping (verify extracted fields match expected structure)
- Integration with existing test suite (all 19 existing tests + new Discogs tests)

## Future: Audio Analysis (deferred)

SoundStat.info and/or Songstats API will be added in a separate iteration to replace Spotify's deprecated Audio Features API. These provide BPM, key, energy, danceability, and other audio analysis features.
