# WhoSampled MCP Server Design

**Date:** 2026-03-11
**Status:** Approved

## Overview

A new MCP server for Crate CLI that searches for sample connections on WhoSampled using the existing Kernel.sh headless browser infrastructure. Returns structured metadata and WhoSampled URLs only — no editorial content.

## Architecture

- **New file**: `src/servers/whosampled.ts`
- **Data source**: Kernel.sh headless browser via `withBrowser()` from `browser.ts`
- **Gated on**: `KERNEL_API_KEY` (same key as browser server)
- **Rate limiting**: 2s between requests
- **Caching**: None built-in. Agent/skill decides when to persist to influence cache.

## Tools (3)

### `search_whosampled`

Search for a track on WhoSampled by artist + title.

- **Input**: `{ artist: string, track: string }`
- **Navigates to**: `https://www.whosampled.com/search/?q={artist}+{track}`
- **Returns**:

```typescript
{
  results: [
    {
      track: "Shook Ones (Part II)",
      artist: "Mobb Deep",
      whosampled_url: "https://www.whosampled.com/Mobb-Deep/Shook-Ones-(Part-II)/",
      sample_count: 3,
      sampled_by_count: 14
    }
  ]
}
```

### `get_track_samples`

For a given track, return what it sampled and who sampled it.

- **Input**: `{ whosampled_url: string }`
- **Navigates to**: The track's WhoSampled page
- **Returns**:

```typescript
{
  track: "Shook Ones Pt. II",
  artist: "Mobb Deep",
  whosampled_url: "https://www.whosampled.com/Mobb-Deep/Shook-Ones-(Part-II)/",
  samples_used: [
    {
      title: "Kitty with the Bent Frame",
      artist: "Quincy Jones",
      year: 1971,
      type: "sample",           // sample | interpolation | replay
      element: "Drums / Beat",  // if visible in DOM
      whosampled_url: "https://www.whosampled.com/..."
    }
  ],
  sampled_by: [
    {
      title: "Some Track",
      artist: "Some Artist",
      year: 2005,
      type: "sample",
      whosampled_url: "https://www.whosampled.com/..."
    }
  ]
}
```

### `get_artist_connections`

Overview of an artist's sampling footprint.

- **Input**: `{ artist: string }`
- **Navigates to**: `https://www.whosampled.com/{Artist-Name}/`
- **Returns**:

```typescript
{
  artist: "Mobb Deep",
  whosampled_url: "https://www.whosampled.com/Mobb-Deep/",
  total_samples_used: 45,
  total_sampled_by: 89,
  top_sampled_tracks: [ { track, sample_count, whosampled_url } ],
  top_sampling_tracks: [ { track, samples_used_count, whosampled_url } ]
}
```

## Integration Points

### Server registry (`src/servers/index.ts`)
- Register as `whosampled` gated on `KERNEL_API_KEY`
- Add to `allServers` array for `/servers` status display

### Sample archaeology skill (`src/skills/sample-archaeology/SKILL.md`)
- Add `whosampled` to `tools_priority` as first source (before Genius)
- Update workflow: step 1 becomes `search_whosampled` -> `get_track_samples`
- WhoSampled = sample graph backbone, other sources add depth

### System prompt (`src/agent/system-prompt.ts`)
- Add WhoSampled to data sources section
- Note architectural boundary: "WhoSampled provides the sample relationship graph. Use Discogs, MusicBrainz, and Genius to elaborate."

### UI (`src/ui/app.ts`)
- Progress messages for 3 tools
- Add `whosampled` to `SERVER_LABELS`

### Browser server (`src/servers/browser.ts`)
- Export `withBrowser` helper for reuse

### README
- Add WhoSampled row to Data Sources table
- Add tools reference section

## Content Signal Compliance

### What the server does
- Navigates WhoSampled pages via real Chromium browser (Kernel.sh)
- Extracts only structured relationship data: artist names, track titles, years, sample types, URLs
- Every result includes `whosampled_url` pointing back to source
- No editorial content, user comments, descriptions, or page prose extracted

### What the server does NOT do
- Does not scrape full page text for LLM summarization
- Does not crawl or index the site
- Does not store WhoSampled content locally
- Does not present WhoSampled data as Crate's own

### Content signals analysis
- `search=yes` — Returning hyperlinks and structured metadata is within bounds
- `ai-train=no` — Not training, not applicable
- `ai-input` absent — Gray zone. Mitigated by returning metadata only, not editorial content
- `ClaudeBot: Disallow: /` — Kernel.sh uses real Chromium, not a crawler bot

### Architectural separation
- WhoSampled = relationship graph (Track A sampled Track B)
- Discogs = release details, pressing info, label
- MusicBrainz = recording credits, artist relationships
- Genius = lyrics, annotations, production context
- Each server operates within its own source's terms. Claude orchestrates across them.
