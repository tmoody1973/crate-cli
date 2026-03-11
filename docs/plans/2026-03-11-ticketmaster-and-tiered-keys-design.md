# Ticketmaster MCP Server & Two-Tier Key Architecture — Design Document

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Ticketmaster Discovery API MCP server to crate-cli and introduce a two-tier key architecture where core research sources (Ticketmaster, Last.fm, Discogs) work out of the box via embedded default keys, with user-provided keys as optional overrides.

**Architecture:** New MCP server following existing `tool()` + `createSdkMcpServer()` pattern. Config system extended with `resolveKey()` that checks user env vars first, embedded defaults second. Applies to both CLI and Crate Web.

**Tech Stack:** TypeScript, Zod, Ticketmaster Discovery API v2, existing crate-cli server infrastructure

---

## Section 1: Ticketmaster MCP Server

Four tools following the existing crate-cli server pattern:

| Tool | Description | Key Params |
|------|------------|------------|
| `search_events` | Find concerts/shows by artist, city, date range | `keyword`, `city`, `stateCode`, `startDateTime`, `endDateTime`, `size` |
| `search_attractions` | Look up artists/performers on Ticketmaster | `keyword`, `size` |
| `search_venues` | Find venues by name or location | `keyword`, `city`, `stateCode`, `size` |
| `get_event_details` | Get full details for a specific event | `eventId` |

### API Details

- Base URL: `https://app.ticketmaster.com/discovery/v2/`
- Auth: `?apikey={key}` query parameter
- Rate limit: 5 req/sec, 5000/day (free tier)
- Classification filter: `classificationName=music` on event searches to filter out sports/theater

### Response Shaping

Each handler strips the verbose Ticketmaster response to what Claude needs:

```typescript
// search_events returns:
{
  events: [{
    name: string,
    date: string,        // "2026-04-15"
    time: string,        // "20:00"
    venue: string,       // "Metro Chicago"
    city: string,        // "Chicago, IL"
    priceRange: string,  // "$35 - $75"
    status: string,      // "onsale"
    url: string,         // ticketmaster.com link
    artists: string[],   // ["Khruangbin", "Men I Trust"]
  }]
}

// search_attractions returns:
{
  attractions: [{
    name: string,
    id: string,
    genre: string,
    subGenre: string,
    url: string,
    imageUrl: string,
    upcomingEvents: number,
  }]
}

// search_venues returns:
{
  venues: [{
    name: string,
    city: string,
    state: string,
    country: string,
    address: string,
    url: string,
    imageUrl: string,
    upcomingEvents: number,
  }]
}

// get_event_details returns:
{
  name: string,
  date: string,
  time: string,
  venue: { name: string, city: string, address: string },
  artists: string[],
  priceRange: string,
  status: string,
  url: string,
  seatmap: string,     // seatmap image URL if available
  presales: [{ name: string, startDateTime: string, endDateTime: string }],
  classification: { genre: string, subGenre: string },
}
```

File: `src/servers/ticketmaster.ts`

---

## Section 2: Two-Tier Key Architecture

### Tier 1 — Zero-Config (embedded default keys)

| Server | Key Type | Rationale |
|--------|---------|-----------|
| MusicBrainz | No key needed | Open API, rate-limited only |
| Wikipedia | No key needed | Open API |
| Bandcamp | No key needed | Scraping |
| WhoSampled | No key needed | Scraping via Kernel stealth |
| Telegraph | No key needed | Open API |
| News | No key needed | RSS feeds |
| Ticketmaster | Embedded default | 5000/day free tier |
| Last.fm | Embedded default | Generous free tier |
| Discogs | Embedded default | 60 req/min free tier |

### Tier 2 — Bring Your Own Key

| Server | Why BYOK |
|--------|---------|
| Anthropic | Required, usage-based billing |
| Genius | Personal access token |
| YouTube Data API | Quota-based, user's own project |
| Tumblr | OAuth, tied to user's blog |
| Kernel (Browser) | Paid service |
| Mem0 | Paid service |
| Web Search (Tavily/Exa) | Paid tiers |

### Embedded Key Resolution

```typescript
// src/utils/config.ts
const EMBEDDED_KEYS: Record<string, Record<string, string>> = {
  ticketmaster: { TICKETMASTER_API_KEY: "embedded-key-here" },
  lastfm: { LASTFM_API_KEY: "embedded-key-here" },
  discogs: { DISCOGS_KEY: "embedded-key-here", DISCOGS_SECRET: "embedded-secret-here" },
};

// User's env var always wins
function resolveKey(envVar: string): string | undefined {
  return process.env[envVar] || findEmbeddedKey(envVar);
}

function isUsingEmbeddedKey(service: string): boolean {
  const serviceKeys = EMBEDDED_KEYS[service];
  if (!serviceKeys) return false;
  return Object.keys(serviceKeys).every(k => !process.env[k]);
}
```

### Crate Web Key Resolution

```typescript
// /api/chat route
function getKeyForService(service: string, userKeys: DecryptedKeys): string {
  // User's own key always wins
  if (userKeys[service]) return userKeys[service];
  // Fall back to embedded (Vercel env var)
  return process.env[`EMBEDDED_${service.toUpperCase()}_KEY`] || "";
}
```

### Graceful Degradation

On 429 responses: "Discogs rate limit reached. Try again in a moment, or add your own Discogs key in Settings for priority access."

Agent naturally works around rate limits by using alternative sources.

---

## Section 3: CLI Integration Changes

### `src/utils/config.ts`

- Add `EMBEDDED_KEYS` map with default keys for Ticketmaster, Last.fm, Discogs
- Add `resolveKey(envVar)` function — checks `process.env` first, embedded fallback second
- Add `isUsingEmbeddedKey(service)` helper
- Update `CrateConfig.availableKeys` to include both env vars and embedded fallbacks
- Add `TICKETMASTER_API_KEY` to `KEY_GATED_SERVERS` map (already partially there as `events`)

### `src/servers/index.ts`

- Import and register `ticketmasterServer`
- Update Discogs, Last.fm conditions to use `resolveKey()` — they now activate without user env vars
- Ticketmaster registration: `if (resolveKey("TICKETMASTER_API_KEY")) servers.ticketmaster = ticketmasterServer`

### `src/agent/system-prompt.ts`

- Add Ticketmaster to available tools documentation
- Add key tier awareness: "Discogs, Last.fm, and Ticketmaster use shared keys by default. If rate limited, suggest the user add their own key."

### `src/ui/app.ts`

Tool progress messages for Ticketmaster:
- `search_events` → "Searching for upcoming events..."
- `search_attractions` → "Looking up artist on Ticketmaster..."
- `search_venues` → "Finding venues..."
- `get_event_details` → "Getting event details..."

### No Breaking Changes

Users with existing env vars see zero difference. Users without Discogs/Last.fm/Ticketmaster keys now get those servers automatically.

---

## Section 4: Crate Web Integration

### Settings UI

- Tier 1 services show "Using shared key" badge with green dot
- Small text: "Works out of the box. Add your own key for priority access."
- "How to get this key" expandable still available for users who want their own
- Tier 2 services show "Not configured" with yellow dot

### First-Run Experience

- Welcome screen only asks for **Anthropic key** (only truly required key)
- No "Recommended" tier prompt — Discogs, Last.fm, Ticketmaster already work
- After Anthropic key → straight to workspace
- "You have 12 research sources active. Add more keys in Settings to unlock Genius, YouTube, and others."

### Contextual Nudges

- Tier 1 rate-limited: "Discogs is busy right now (shared key). [Add your own key →] for uninterrupted access."
- Tier 2 missing: "I'd normally check Genius for lyrics, but that source isn't connected. [Add Genius key →]"

### Convex Schema

No changes needed. `encryptedKeys` blob stores whatever keys the user adds. Absence of a key means "use embedded."

---

## Section 5: Testing & Security

### Ticketmaster Server Tests (`tests/ticketmaster.test.ts`)

- Mock HTTP responses for all 4 tools
- Verify response shaping (strips verbose JSON to clean format)
- Verify `classificationName=music` filter applied on event searches
- Verify rate limit handling (429 → graceful error message)
- Verify API key passed as query parameter

### `resolveKey()` Tests

- User env var present → returns user's key
- User env var absent → returns embedded key
- Both absent → returns undefined (server doesn't register)
- `isUsingEmbeddedKey()` returns correct boolean for each case

### Embedded Key Security

- **CLI:** Keys bundled in npm package — free-tier keys, not secrets. Same pattern as apps shipping Google Maps API keys.
- **Web:** Keys as Vercel env vars, server-side only. Never sent to browser.
- **Rotation:** If key is abused, rotate it. Ship new CLI version. Web rotates instantly via Vercel env update.
- **Key scoping:** Register embedded keys under a dedicated "Crate" developer account (not personal) for separate usage monitoring.
