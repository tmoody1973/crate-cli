# Bandcamp MCP Server — Design

## Overview

Add a Bandcamp MCP server to crate-cli that extracts structured data from Bandcamp without a public API. Uses a 5-layer extraction approach: pagedata parsing, internal discover API, search page scraping, oEmbed, and RSS feeds.

No API key required. Always available alongside MusicBrainz and Wikipedia.

## Architecture

Single file: `src/servers/bandcamp.ts` following the existing server pattern (`createSdkMcpServer()` + `tool()` + Zod).

### Infrastructure Layer

**Rate Limiting:** 1.5s minimum between requests (module-scoped `lastRequest` + async `rateLimit()`).

**Fetch Wrapper:** `bandcampFetch(url)` handles rate limiting, User-Agent header (`Crate/1.0 (music-research-agent)`), error handling, and returns the response body as text.

**Pagedata Extractor:** `extractPagedata(html)` finds `<div id="pagedata" data-blob="...">`, URL-decodes the blob, and parses as JSON. This is the primary structured data source — Bandcamp embeds complete page metadata here.

**Tralbum Extractor:** `extractTralbum(html)` finds `data-tralbum` attributes on `<script>` tags, parses the JSON. Contains track listings with durations and streaming URLs.

**Result Helpers:** `toolResult(data)` and `toolError(msg)` matching existing pattern.

### 5 Extraction Layers

| Layer | Source | Data |
|-------|--------|------|
| 1. Pagedata | `<div id="pagedata" data-blob="...">` + `data-tralbum` | Complete page metadata, track listings |
| 2. Discover API | `bandcamp.com/api/discover/1/discover_web` | Genre/tag browsing with filters |
| 3. Search Parsing | `bandcamp.com/search?q=...` via cheerio | Search results across types |
| 4. oEmbed | `bandcamp.com/services/oembed` | Embed metadata for URLs |
| 5. RSS Feeds | `{artist}.bandcamp.com/feed` via rss-parser | Recent releases |

## Tools

### 1. `search_bandcamp`

Search Bandcamp for artists, albums, tracks, or labels.

**Input:** `query` (string), `item_type` (optional: "artist" | "album" | "track" | "label")

**Layer:** 3 (Search Page Parsing with cheerio)

**Returns:**
```typescript
{
  query: string;
  item_type: string | "all";
  result_count: number;
  results: Array<{
    type: "artist" | "album" | "track" | "label";
    name: string;
    url: string;
    artist?: string;      // for albums/tracks
    album?: string;       // for tracks
    image_url?: string;
    tags?: string[];
    location?: string;    // for artists/labels
  }>;
}
```

### 2. `get_artist_page`

Get full artist/label profile from their Bandcamp page.

**Input:** `url` (string, e.g. `https://artist.bandcamp.com`)

**Layers:** 1 (Pagedata) + 5 (RSS for recent releases)

**Returns:**
```typescript
{
  name: string;
  url: string;
  location?: string;
  bio?: string;
  image_url?: string;
  band_id?: number;
  discography: Array<{
    title: string;
    url: string;
    type: "album" | "track";
    release_date?: string;
    art_url?: string;
  }>;
  links?: string[];        // external links
  recent_feed?: Array<{    // from RSS
    title: string;
    url: string;
    date: string;
  }>;
}
```

### 3. `get_album`

Get full album details including tracklist with durations.

**Input:** `url` (string, e.g. `https://artist.bandcamp.com/album/title`)

**Layers:** 1 (Pagedata + Tralbum)

**Returns:**
```typescript
{
  title: string;
  artist: string;
  url: string;
  release_date?: string;
  art_url?: string;
  about?: string;
  credits?: string;
  tags: string[];
  label?: string;
  price?: { amount: number; currency: string };
  tracks: Array<{
    number: number;
    title: string;
    duration_seconds?: number;
    duration_formatted?: string;
    artist?: string;       // if per-track artist differs
  }>;
}
```

### 4. `discover_music`

Browse Bandcamp's discovery system by genre/tag with filters.

**Input:** `tag` (string), `sort` (optional: "top" | "new" | "rec"), `format` (optional: "vinyl" | "cd" | "cassette" | "digital"), `location` (optional: number, geo ID)

**Layer:** 2 (Internal Discover API)

**Returns:**
```typescript
{
  tag: string;
  sort: string;
  result_count: number;
  items: Array<{
    title: string;
    artist: string;
    url: string;
    art_url?: string;
    genre?: string;
    tags?: string[];
    release_date?: string;
  }>;
}
```

### 5. `get_tag_info`

Get information about a Bandcamp tag/genre including top releases.

**Input:** `tag` (string)

**Layers:** 1 (Tag page pagedata) + 5 (Tag RSS feed if available)

**Returns:**
```typescript
{
  tag: string;
  url: string;
  description?: string;
  related_tags?: string[];
  top_releases?: Array<{
    title: string;
    artist: string;
    url: string;
    art_url?: string;
  }>;
}
```

## Registration

In `src/servers/index.ts`, add Bandcamp as a free server (no `requiredKeys`):

```typescript
import { createBandcampServer } from "./bandcamp.js";

// In getActiveServers(), alongside MusicBrainz and Wikipedia:
servers.push({
  name: "bandcamp",
  server: createBandcampServer(),
});
```

## System Prompt

Add to `src/agent/system-prompt.ts` under data sources:

```
### Bandcamp (always available, no API key)
Direct access to Bandcamp — the largest independent music marketplace. Strong on independent artists,
vinyl/cassette releases, genre tags, and pricing. Use these tools for:
- **search_bandcamp** — Search for artists, albums, tracks, or labels on Bandcamp.
- **get_artist_page** — Get artist/label profile: bio, location, discography, and recent releases.
- **get_album** — Get full album details: tracklist with durations, tags, credits, label, and pricing.
- **discover_music** — Browse Bandcamp's discovery by genre tag with sort and format filters.
- **get_tag_info** — Get genre/tag info: description, related tags, and top releases.
```

## Testing

File: `tests/bandcamp.test.ts`

Follow the `wikipedia.test.ts` pattern:
- Mock global fetch with `vi.stubGlobal("fetch", mockFetch)`
- Test infrastructure functions: `extractPagedata()`, `extractTralbum()`
- Test each handler with mocked HTML/JSON responses
- Test error cases (404, malformed HTML, missing pagedata)
- Export handlers and utility functions for direct testing

## Dependencies

- **cheerio** — already installed (used by Genius server)
- **rss-parser** — new dependency, needed for Layer 5 (RSS feeds)

## Error Handling

- `bandcampFetch()` catches network errors, returns null or throws
- Each handler wraps in try/catch, returns `toolError()` on failure
- Missing pagedata gracefully falls back to partial data
- Rate limit errors get a retry after delay

## README Updates

Add Bandcamp row to the Data Sources table:

```
| **Bandcamp** | 5 (search, artist, album, discover, tag info) | No |
```
