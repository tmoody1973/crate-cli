
# Crate CLI — User-Friendliness Spec

## Screens / Components to Build

| Component | Priority | States |
|-----------|----------|--------|
| First-run onboarding flow | P0 | Welcome → API status → Orientation → Example prompt |
| Grouped `/help` output | P0 | Categorized: Research / Session / Library |
| Source-by-source progress indicator | P0 | Fast (<3s) / Medium (3-10s) / Long (10s+) tiers |
| Error message templates | P0 | API failure / Rate limit / Missing key / Bad query |
| Contextual hint system | P1 | Post-response tips, shown once each, max 1 per response |
| Empty state guidance | P1 | /collection, /playlists, /exports when empty |
| Post-response footer | P1 | Sources · Cost · Duration receipt |
| Interrupt handling (Esc/Ctrl+C) | P1 | Partial response with missing-source note |

## Decisions Made

| Decision | Choice | Why |
|----------|--------|-----|
| Onboarding blocking | Non-blocking — missing API keys are warnings, not blockers | Users can research immediately with keyless sources (MusicBrainz, Bandcamp, News) |
| Teaching approach | Example queries, not feature lists | Users learn by doing; 3 real queries seed the first interaction |
| First-run slash commands shown | Only `/help`, `/cost`, `/quit` | Progressive disclosure — others discovered via contextual hints |
| Serato setup | Auto-detect, surface in status board | Don't ask users to configure what can be detected |
| Hint frequency | Each hint shown once per user (persisted in SQLite), max 1 per response, none in first 2 messages | Prevent nagging while ensuring coverage |
| Missing key nudges | Show only when source is directly relevant to query, max once per session per key | Context-sensitive, not spammy |
| Help structure | Grouped by category (Research / Session / Library) | Scannable reference vs. flat wall of text |
| Progress tiers | 3 tiers scaled to duration | Fast queries don't flash useless info; long queries explain delays |
| Error message format | What happened → Impact → Action | Consistent, actionable, no jargon |
| Post-response footer | Always show Sources · Cost · Time | Builds trust, reinforces multi-source value |
| Interrupt model | Esc = partial response, Ctrl+C = cancel | User stays in control during long queries |

## Error Message Patterns

All user-facing errors follow: **What happened** → **Impact** → **Action**

| Error Type | Pattern | Example |
|------------|---------|---------|
| API source down | Degrade gracefully, note missing source | "⚠ Discogs was unreachable — vinyl pressing details may be incomplete. Try again later or run `crate servers`." |
| Rate limited | Transparent queuing with explanation | "⏳ Queuing Discogs requests (rate limit: 60/min) — this may take a moment for large discographies" |
| Missing API key | Actionable skip, only when relevant | "ℹ Spotify could provide exact BPM and key data for this query. Add credentials with `crate keys`." |
| Bad/ambiguous query | Guide with example, never blame | "I couldn't find an artist matching 'xyzzy.' Try including more detail — like `tracks by [artist] from [year]`" |

**Rules:** Never show stack traces, HTTP codes, or internal error IDs. The agent translates system failures into human language.

## Progress Feedback Tiers

| Duration | Display | Detail Level |
|----------|---------|-------------|
| < 3s | `⠋ Researching...` | Single spinner, no source breakdown |
| 3–10s | `✓ MusicBrainz` / `⠋ Genius...` | Source-by-source, checkmarks on completion |
| 10s+ | `✓ Genius — 47 samples` / `⏳ Discogs (rate limit)` | Source progress + data counts + delay explanations |

Spinner animates on active step (`⠋`), completed steps show `✓`. Lines replace in-place via Ink re-render.

## Contextual Hint Triggers

| Trigger | Hint |
|---------|------|
| Long research response | "Save this research with 'export as markdown' or 'save to HTML'" |
| 5+ messages in session | "Use /cost to check token usage for this session" |
| Track list result | "Say 'add these to a playlist' or 'export as M3U'" |
| First Serato detection | "Serato found! Try 'show my crates' or 'what's in my library?'" |
| First collection add | "Use /collection to see your stats anytime" |

## Constraints

- **No blocking on missing keys** — every query should return something useful
- **No generic spinners for 3s+ queries** — always show source-level progress
- **No hint repetition** — persist seen-hints per user in SQLite
- **No raw error output** — every failure must pass through the What/Impact/Action template
- **Ink (React for terminals)** is the rendering framework — all progress and feedback uses Ink components
