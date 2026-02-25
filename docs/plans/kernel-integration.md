# Kernel Integration Plan for Crate

> Cloud browser infrastructure for deep music research beyond APIs.

**Status:** Proposed
**Date:** 2026-02-25
**Dependency:** [Kernel](https://www.kernel.sh/) — YC-backed browser infrastructure for AI agents

---

## The Problem

Crate currently relies on structured APIs (MusicBrainz, Discogs, Genius, Last.fm, etc.) and search providers (Tavily, Exa). This covers a lot, but the richest music knowledge lives on the **open web** — in full-length reviews, dynamically-rendered pages, and sites that aggressively block scrapers:

- **Pitchfork, The Wire, Resident Advisor** — Full review text is behind dynamic rendering and anti-bot protections. Crate only gets search snippets today.
- **Bandcamp** — No public API. Current Cheerio-based scraping misses dynamically-loaded content like "supporters also purchased" and fan collections.
- **RateYourMusic / Sonemic** — The most detailed genre taxonomy and rating system in music. Aggressively blocks all automated access.
- **Venue and event sites** — Resident Advisor events, Dice, local venue pages have richer data than the Ticketmaster API.
- **Label and distributor sites** — Catalog pages, press releases, liner notes.

## The Solution

Kernel provides **cloud-hosted browsers with anti-bot detection bypass, persistent sessions, and Playwright integration** — exactly what Crate needs to read the music internet like a human researcher.

---

## Feature List

### F1: Deep Article Extraction
**Priority:** High
**Impact:** Transforms influence tracing from snippet-based to full-text evidence

- Agent finds a review URL via web search (existing flow)
- Opens the actual page in a Kernel browser session
- Extracts full article text, author byline, publication date
- Parses every artist mention in context (not just co-mention from a snippet)
- Builds richer influence edges with full quotes and paragraph context
- Stores extracted articles in local SQLite for future reference

**Before:** "Pitchfork mentions Artist A and Artist B in the same search result"
**After:** "In paragraph 3 of their 2019 review, Philip Sherburne writes: 'Artist A's approach to layering owes an obvious debt to Artist B's 1997 album...'"

### F2: Bandcamp Deep Browse
**Priority:** High
**Impact:** Unlocks the independent music graph

- Browse dynamically-rendered Bandcamp pages (album, artist, label, fan)
- Extract "supporters also purchased" recommendations — Bandcamp's organic discovery graph for independent music
- Scrape fan collections to find tastemakers and pattern-match purchases
- Parse label catalogs with full release metadata
- Extract editorial content (Bandcamp Daily articles linked from artist pages)

**New tools:**
- `bandcamp_deep_browse` — Full page extraction for any Bandcamp URL
- `bandcamp_supporters_graph` — "Also purchased" network for an album
- `bandcamp_fan_collection` — Full collection for a fan/tastemaker
- `bandcamp_label_catalog` — Complete label discography

### F3: RateYourMusic Integration
**Priority:** High
**Impact:** Adds the most detailed genre and rating data in music

RYM/Sonemic is the gold standard for:
- Genre classification (hierarchical taxonomy with 2000+ genres)
- Aggregate ratings and rating distributions
- User-curated lists (best of year, genre essentials, etc.)
- Descriptors (moods, themes, sonic qualities)
- Credits and personnel

**New tools:**
- `rym_artist_info` — Ratings, genres, descriptors, discography
- `rym_album_info` — Detailed ratings, lists featuring this album, descriptors
- `rym_genre_chart` — Top-rated albums in any genre/year combination
- `rym_search` — Search across artists, albums, labels
- `rym_list` — Extract curated user lists

**Requires:** Kernel persistent profiles to maintain session state across requests (RYM rate-limits aggressively).

### F4: Full Review Scraping for 26 Publications
**Priority:** Medium
**Impact:** Makes every publication in the influence system fully readable

Currently the influence system searches 26 publications but only gets snippets. With Kernel:
- Open any review URL and extract the complete article
- Parse structured review data (rating, genre tags, related artists mentioned)
- Build a local archive of full reviews for instant future access
- Support paywalled sites via persistent authenticated sessions (user provides their own credentials)

**Publications that benefit most:**
- Pitchfork (dynamic rendering, anti-bot)
- The Quietus (complex page structure)
- Resident Advisor (heavy JS rendering)
- The Wire (partial paywall)
- NME, Stereogum, FACT (ad-heavy, complex DOM)

### F5: Visual Evidence Screenshots
**Priority:** Medium
**Impact:** Published research includes visual proof

When publishing to Telegraph or Tumblr:
- Screenshot the relevant section of a review page
- Highlight the specific paragraph that documents an influence connection
- Embed screenshots in published pages as visual evidence
- "Here's the Pitchfork review where the critic draws the line from Artist A to Artist B"

**New tools:**
- `screenshot_url` — Take a screenshot of any URL
- `screenshot_element` — Screenshot a specific element (e.g., a review paragraph)

### F6: Live Event Deep Scrape
**Priority:** Low
**Impact:** Richer event data beyond Ticketmaster

- Scrape Resident Advisor event pages (lineup, venue details, door times, age)
- Parse Dice event listings
- Extract local venue calendars
- Get support act information that APIs don't expose
- Check sold-out status across platforms

### F7: Liner Notes & Credits Extraction
**Priority:** Low
**Impact:** Session musician and production credit research

- Navigate label/distributor sites for press releases and liner notes
- Extract detailed credits from album pages across multiple sources
- Cross-reference with MusicBrainz credits for completeness
- Parse Discogs release pages for contributor credits not in the API

---

## Technical Architecture

### New MCP Server: `src/servers/browser.ts`

```
browser.ts
├── createBrowserSession()     — Kernel SDK: kernel.browsers.create()
├── navigateAndExtract()       — Go to URL, extract structured content
├── screenshotPage()           — Full page or element screenshot
├── extractArticle()           — Smart article extraction (title, author, date, body, artist mentions)
├── extractBandcampPage()      — Bandcamp-specific structured extraction
├── extractRymPage()           — RYM-specific structured extraction
└── closeBrowserSession()      — Clean up
```

### Kernel SDK Integration

```typescript
import Kernel from "@onkernel/sdk";

const kernel = new Kernel();

async function createBrowserSession(profileName?: string) {
  const browser = await kernel.browsers.create({
    stealth: true,
    profile: profileName ? { name: profileName } : undefined,
  });
  // Returns CDP WebSocket URL for Playwright connection
  return browser;
}
```

### Agent Flow

```
User: "Trace the influence from Fela Kuti to Beyoncé"

1. Agent searches 26 publications via Tavily/Exa (existing)
2. Gets URLs: Pitchfork review, Guardian article, RA feature
3. Agent calls browser tools to open each URL in Kernel
4. Extracts full text, finds specific paragraphs mentioning both artists
5. Builds influence edges with full quotes and context
6. Caches extracted articles locally for instant future access
7. Returns results with full attribution + option to screenshot evidence
```

### Data Flow

```
Web Search (Tavily/Exa) → URL Discovery
         ↓
Kernel Browser Session → Full Page Load (anti-bot bypass)
         ↓
Article Extraction → Structured Data (title, author, body, mentions)
         ↓
Local SQLite Cache → Instant future access
         ↓
Influence Graph → Richer edges with full-text evidence
```

### Profile Strategy

| Profile | Purpose | Session Duration |
|---------|---------|-----------------|
| `crate-general` | General browsing, article extraction | Ephemeral |
| `crate-bandcamp` | Bandcamp browsing with fan account | Persistent (72h) |
| `crate-rym` | RateYourMusic with user session | Persistent (72h) |
| `crate-publications` | Paywalled publication access | Persistent (72h) |

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Add `@onkernel/sdk` dependency
- [ ] Create `src/servers/browser.ts` MCP server with basic tools
- [ ] Implement `browse_url` — open URL, extract text content
- [ ] Implement `screenshot_url` — take page screenshots
- [ ] Add `KERNEL_API_KEY` to config system and onboarding wizard
- [ ] Register browser server in `src/servers/index.ts`
- [ ] Add progress messages in `src/ui/app.ts`
- [ ] Basic tests

### Phase 2: Deep Article Extraction (Week 2)
- [ ] Smart article parser — detect title, author, date, body, artist mentions
- [ ] Integrate with influence tracing: agent uses browser as fallback when snippets aren't enough
- [ ] Local article cache in SQLite (avoid re-fetching)
- [ ] Publication-specific extraction rules for top 10 most-used publications
- [ ] Update system prompt with browser tool usage guidelines

### Phase 3: Bandcamp Deep Browse (Week 2-3)
- [ ] Bandcamp page type detection (album, artist, label, fan)
- [ ] "Supporters also purchased" extraction
- [ ] Fan collection browsing
- [ ] Label catalog extraction
- [ ] Persistent Bandcamp profile for session continuity

### Phase 4: RateYourMusic (Week 3-4)
- [ ] RYM page parsers (artist, album, genre chart, list)
- [ ] Rate limiting and request throttling (respect the site)
- [ ] Persistent RYM profile for session state
- [ ] Genre taxonomy extraction and local caching
- [ ] Rating and descriptor integration with existing data

### Phase 5: Visual Evidence & Publishing (Week 4)
- [ ] Element-level screenshots (specific review paragraphs)
- [ ] Integration with Telegraph/Tumblr publishing — embed screenshots
- [ ] "Evidence mode" for influence chains — visual proof for every hop

---

## Impact Summary

| Metric | Current | With Kernel |
|--------|---------|-------------|
| Data sources | 17 APIs + search | 17 APIs + the entire music web |
| Influence evidence | Search snippets | Full review text + screenshots |
| Bandcamp depth | Static HTML | Dynamic pages + recommendation graph |
| Genre data | Basic (Last.fm tags) | RYM hierarchical taxonomy (2000+ genres) |
| Review access | Snippets only | Full articles from 26 publications |
| Published research | Text only | Text + visual proof screenshots |
| Anti-bot bypass | None (blocked by many sites) | Kernel stealth mode |

### Positioning Upgrade

**Before:** "Crate searches 17 music data sources"
**After:** "Crate reads the entire music internet like a human researcher — reviews, databases, record stores, and rating sites — with full anti-bot bypass and cloud browser infrastructure"

---

## Environment Variables

| Key | Required | Description |
|-----|----------|-------------|
| `KERNEL_API_KEY` | Yes (for browser features) | Kernel API key from [dashboard.onkernel.com](https://dashboard.onkernel.com) |
| `KERNEL_PROFILE_BANDCAMP` | Optional | Persistent profile name for Bandcamp sessions |
| `KERNEL_PROFILE_RYM` | Optional | Persistent profile name for RYM sessions |

---

## Dependencies

- `@onkernel/sdk` — Kernel TypeScript SDK
- `playwright` — Browser automation (connects to Kernel CDP)
- Existing: `cheerio` (fallback for simple HTML), `better-sqlite3` (article cache)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Kernel API cost at scale | Cache aggressively — never fetch the same URL twice. Use APIs first, browser as fallback. |
| Site structure changes break parsers | Build generic article extractor first, site-specific parsers as enhancement layer |
| RYM blocks even Kernel sessions | Aggressive rate limiting, profile rotation, respect robots.txt spirit |
| Increased latency (browser load vs API call) | Parallel browser sessions, local cache, only use browser when API data is insufficient |
| User doesn't have Kernel key | All browser features are optional. Crate works fully without Kernel — it's a power-user upgrade. |

---

## References

- [Kernel](https://www.kernel.sh/) — Browser infrastructure for AI agents
- [Kernel Docs](https://kernel.sh/docs/) — API documentation
- [Kernel + Browser Use](https://www.kernel.sh/docs/integrations/browser-use) — Integration guide
- [Kernel + Claude Agent SDK](https://kernel.sh/docs/) — Agent SDK integration
- [@onkernel/sdk](https://www.npmjs.com/package/@onkernel/sdk) — TypeScript SDK
