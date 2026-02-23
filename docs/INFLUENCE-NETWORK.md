# Influence Network: Review-Driven Music Discovery

## How Crate Uses Music Criticism to Map Artistic Influence

Crate's influence network is a suite of three interconnected features — **Review-Driven Discovery**, **Influence Tracing**, and the **Influence Cache** — that together form an organic, growing knowledge graph of how artists connect, inspire, and build on each other's work.

These features are grounded in the **Stell-R methodology** published in the *Harvard Data Science Review* (2025), which demonstrated that **artist co-mentions in music reviews are a powerful proxy for artistic influence and connection**. When a critic reviewing Radiohead's *Kid A* mentions Aphex Twin and Kraftwerk in the same paragraph, that co-occurrence encodes real information about sonic lineage — information that streaming algorithms built on listening data alone can never capture.

---

## Table of Contents

1. [The Research Foundation](#the-research-foundation)
2. [Feature 1: Review-Driven Discovery](#feature-1-review-driven-discovery)
3. [Feature 2: Influence Tracing](#feature-2-influence-tracing)
4. [Feature 3: Influence Cache](#feature-3-influence-cache)
5. [Why This Matters: Beyond the Algorithm](#why-this-matters-beyond-the-algorithm)
6. [Integration with Crate's Server Ecosystem](#integration-with-crates-server-ecosystem)
7. [Architecture Overview](#architecture-overview)

---

## The Research Foundation

The Stell-R methodology (Harvard Data Science Review, 2025) introduced a novel approach to mapping artistic influence: instead of relying on collaborative filtering (what users listen to together) or audio feature similarity (what sounds alike), it analyzes **critical co-mentions** — the artists that music journalists reference when writing about other artists.

The core insight is simple but powerful:

> When a reviewer of Artist A's album mentions Artist B, that co-mention is a meaningful signal of artistic connection — even stronger when the mention appears in influence-indicating language ("influenced by", "reminiscent of", "in the vein of"), and strongest when the co-mention is reciprocal (reviews of B also mention A).

Crate implements this methodology through three layers:

| Layer | Purpose | Speed | Data Source |
|-------|---------|-------|-------------|
| **Review-Driven Discovery** | Extract co-mentions from real music criticism | Seconds (web search) | 23 music publications |
| **Influence Tracing** | Build multi-hop paths between artists | 5–20 seconds | Tavily + Exa neural search + co-mention extraction |
| **Influence Cache** | Persist and query discovered connections | Instant (local SQLite) | Previously discovered edges |

---

## Feature 1: Review-Driven Discovery

### What It Does

Review-Driven Discovery searches 23 music publications for album reviews using Tavily's advanced search depth for richer snippets. When Exa is available and initial results are sparse, it automatically discovers additional related reviews via semantic similarity (`findSimilar`). Full review text is extracted via Tavily for deeper co-mention analysis.

### The 23 Publication Sources

| Publication | Domain | Known For |
|-------------|--------|-----------|
| Pitchfork | pitchfork.com | Indie, experimental, comprehensive reviews |
| The Quietus | thequietus.com | Underground, avant-garde, long-form criticism |
| Resident Advisor | residentadvisor.net | Electronic, dance, club culture |
| Stereogum | stereogum.com | Indie rock, album previews, news |
| BrooklynVegan | brooklynvegan.com | Punk, hardcore, indie, live coverage |
| FACT Magazine | factmag.com | Electronic, grime, experimental |
| NME | nme.com | British rock, pop, mainstream crossover |
| Consequence of Sound | consequence.net | Album reviews, rankings, features |
| NPR Music | npr.org | Broad coverage, Tiny Desk, world music |
| The Guardian | theguardian.com | Cultural criticism, long-form features |
| Sputnikmusic | sputnikmusic.com | Community reviews, metal, progressive |
| Goutemesdisques | goutemesdisques.com | French music criticism, international scope |
| Bandcamp Daily | daily.bandcamp.com | Indie, underground, artist-direct |
| Tiny Mix Tapes | tinymixtapes.com | Experimental, electronic, noise |
| Rate Your Music | rateyourmusic.com | Community reviews, deep genre taxonomy |
| AllMusic | allmusic.com | Comprehensive review database |
| The Wire | thewire.co.uk | Avant-garde, experimental, improvised |
| The FADER | thefader.com | Hip-hop, electronic, youth culture |
| Aquarium Drunkard | aquariumdrunkard.com | Deep cuts, psychedelia, folk |
| Boomkat | boomkat.com | Electronic, experimental editorial |
| Passion of the Weiss | passionweiss.com | Hip-hop criticism |
| The Vinyl District | thevinyldistrict.com | Physical media community |
| New York Times | nytimes.com | Cultural criticism, mainstream crossover |

### How the Co-Mention Extraction Works

The `extractArtistMentions()` algorithm processes review text in five stages:

1. **Sentence segmentation** — Splits text by sentence boundaries (`.!?`) to maintain context windows.

2. **Name extraction** — Two complementary regex patterns run on each sentence:
   - **Title Case pattern** — Catches multi-word artist names like "Aphex Twin", "My Bloody Valentine", "DJ Shadow", "MF DOOM". Handles prefixes (The, DJ, MC, MF, El, St., Dr.).
   - **ALL-CAPS pattern** — Catches stylized names like "DOOM", "JPEGMAFIA", "LCD". Filters common all-caps words (THE, AND, FOR, etc.).

3. **Influence phrase detection** — Each sentence is tested against five regex families that match influence-indicating language:

   | Pattern Family | Example Phrases |
   |---------------|-----------------|
   | Direct influence | "influenced by", "inspired by", "echoes of", "channeling", "reminiscent of" |
   | Comparative | "in the vein of", "in the mold of", "compared to", "likened to" |
   | Sonic similarity | "sounds like", "recalls", "evokes", "nods to", "pays tribute to" |
   | Debt/derivation | "owes a debt to", "draws from", "borrows from" |
   | Lineage | "following in the footsteps of", "descended from", "heir to" |

4. **False positive filtering** — Removes common non-artist strings ("the album", "the band", "Rolling Stone", "South London", etc.) and excludes the subject artist being reviewed.

5. **Scoring and ranking** — Results are sorted with influence-context mentions first (names found near influence phrases), then by raw mention count.

### Tools

| Tool | Description |
|------|-------------|
| `search_reviews` | Search 23 music publications for album/artist reviews using Tavily advanced depth. When Exa is available and results are sparse, discovers additional reviews via semantic similarity. Optionally extract full review text for deeper analysis. |
| `extract_influences` | Feed review text (or a URL) through the co-mention extraction algorithm. Returns ranked artist mentions with context snippets and influence indicators. |

### Example Prompts

**Basic review search:**
```
"Find reviews of Bjork's Homogenic and tell me which artists the critics compare her to"
```
Crate searches music publications for "Bjork" "Homogenic" reviews, extracts full text from the top results, runs co-mention analysis, and presents a ranked list of referenced artists with the exact critic quotes.

**Deep influence extraction:**
```
"Search for reviews of Burial's Untrue and extract all the influence signals —
who do critics think shaped that album's sound?"
```
Crate pulls reviews from Resident Advisor, Pitchfork, and The Quietus, then highlights names appearing in influence phrases like "owes a debt to" or "reminiscent of" — revealing connections like Massive Attack, Aphex Twin, and UK garage that shaped the album.

**Scene mapping:**
```
"What artists get mentioned alongside Floating Points in reviews?
I want to understand his critical neighborhood."
```
Crate extracts co-mentions across multiple Floating Points reviews, revealing the critic-perceived sonic neighborhood — which often surfaces unexpected connections that pure listening data misses.

---

## Feature 2: Influence Tracing

### What It Does

Influence Tracing builds on Review-Driven Discovery to construct **multi-hop paths** between artists who may not share an obvious connection. It uses web search and co-mention extraction to find bridge artists — the intermediate nodes that connect distant parts of the musical graph.

### How Path Tracing Works

The `trace_influence_path` tool uses a three-stage strategy:

**Stage 1: Direct Connection Search**
Search for `"Artist A" "Artist B" influence connection music` across the web. If results mention both artists, a direct (depth-1) path exists.

**Stage 2: Neighborhood Expansion (Exa Neural Search)**
If no direct connection is found, search for each artist's influence neighborhood independently using Exa's neural/semantic search (falls back to Tavily if Exa unavailable):
- Search `"Artist A" similar artists influenced review`
- Search `"Artist B" similar artists influenced review`

Exa's neural search outperforms keyword matching for these conceptual queries, surfacing semantically related content that keyword searches miss. Extract co-mentions from both result sets and find **overlap** — artists that appear in reviews of both A and B. These are bridge artists.

**Stage 3: Path Assembly**
Assemble the path with evidence for each link and render it using Crate's visualization system:

```
  Kraftwerk
    │ influenced (Wikipedia: "pioneered electronic pop")
    ▼
  Depeche Mode
    │ co-mentioned (Pitchfork review, 1997)
    ▼
  Radiohead
```

### Bridge Artist Discovery

The `find_bridge_artists` tool specifically targets the most interesting discovery case: artists who connect two otherwise disconnected genres or scenes.

It runs three parallel searches:
1. A crossover search via **Exa neural search**: `"genre A" "genre B" crossover bridge genre influence` — Exa's semantic understanding excels at finding conceptual genre crossover content
2. A genre A artist search via **Tavily**: `best "genre A" artists`
3. A genre B artist search via **Tavily**: `best "genre B" artists`

Artists appearing in both genre contexts are scored as bridge candidates. An artist found in the crossover search AND in both genre searches gets the highest score.

### Tools

| Tool | Description |
|------|-------------|
| `trace_influence_path` | Find a chain of influence between two artists (depth 1–5). Uses Tavily advanced depth for direct connection search and Exa neural search for neighborhood expansion. Returns a path with evidence per link and formatted visualization. |
| `find_bridge_artists` | Find artists that connect two genres or scenes. Uses Exa neural search for conceptual crossover discovery and Tavily for genre-specific searches. Scores candidates by cross-genre co-mention density. |

### Example Prompts

**Direct influence tracing:**
```
"Trace the influence path from Kraftwerk to Radiohead"
```
Crate searches for a direct connection first. Finding that critics frequently link Kraftwerk → synth-pop → electronic rock → Radiohead, it builds a path: Kraftwerk → Depeche Mode → Radiohead, with evidence from specific reviews and Wikipedia entries for each link.

**Cross-genre bridge discovery:**
```
"Who bridges jazz and electronic music? Find artists that connect these two worlds."
```
Crate searches for crossover coverage and finds artists like Herbie Hancock, Flying Lotus, Madlib, and Kamasi Washington who appear in both jazz and electronic criticism, scoring them by how strongly they bridge the gap.

**Deep connection investigation:**
```
"Is there a connection between Fela Kuti and Talking Heads?
Trace the influence path."
```
Crate discovers the well-documented connection through Brian Eno's production work and Afrobeat's influence on new wave, presenting evidence from reviews and biographies.

**Scene bridging:**
```
"Find artists that bridge UK grime and Detroit techno"
```
Crate surfaces unexpected connections — artists who draw from both traditions and appear in reviews of both scenes.

---

## Feature 3: Influence Cache

### What It Does

The Influence Cache persists every discovered influence relationship to a local SQLite database (`~/.crate/influence.db`). The graph grows organically over time — each query about influence adds new edges. On future queries, the agent checks the cache first, providing **instant results** without expensive web searches.

### Why a Local Cache?

Every time Crate discovers a connection — whether from a Last.fm similarity score, a Pitchfork review co-mention, a MusicBrainz collaboration, or a Genius sample relationship — that knowledge is ephemeral by default. The next time you ask a related question, the same web searches have to run again.

The cache solves this by:
- **Persisting edges** with upsert semantics (repeated discoveries strengthen the weight, never weaken it)
- **Tracking provenance** (which source found this connection, with snippets and URLs)
- **Enabling graph queries** (BFS path-finding across the entire accumulated graph)
- **Supporting aliases** (so "DOOM", "MF DOOM", and "Daniel Dumile" all resolve to the same node)

### Database Schema

The cache uses four interconnected tables:

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   artists    │     │  influence_edges  │     │ edge_sources │
├─────────────┤     ├──────────────────┤     ├─────────────┤
│ id (PK)     │◄────│ from_artist_id   │     │ id (PK)     │
│ name        │◄────│ to_artist_id     │     │ edge_id (FK)│────►│influence_edges│
│ name_lower  │     │ relationship     │     │ source_type │
│ genres      │     │ weight           │     │ source_url  │
│ first_seen  │     │ context          │     │ source_name │
│ updated_at  │     │ first_seen       │     │ snippet     │
└─────────────┘     │ updated_at       │     │ discovered_at│
       ▲            └──────────────────┘     └─────────────┘
       │
┌──────────────┐
│artist_aliases│
├──────────────┤
│ alias_lower  │
│ artist_id(FK)│
└──────────────┘
```

### Relationship Types

| Type | Weight Range | Example |
|------|-------------|---------|
| `influenced` | 0.5–1.0 | "Kraftwerk influenced Depeche Mode" |
| `co_mention` | 0.3–0.7 | "Burial mentioned alongside Massive Attack in Pitchfork review" |
| `collaboration` | 0.7–1.0 | "Brian Eno produced Talking Heads' Remain in Light" |
| `sample` | 0.8–1.0 | "DJ Shadow sampled Organ Donor by DJ Shadow" |
| `similar` | 0.3–0.6 | "Last.fm similarity score: 0.78" |
| `bridge` | 0.4–0.8 | "Flying Lotus bridges jazz and electronic" |

### Upsert Semantics

When the same edge is discovered multiple times, the cache uses MAX weight — repeated discoveries can only strengthen a connection, never weaken it:

```sql
INSERT INTO influence_edges (from_artist_id, to_artist_id, relationship, weight, context)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT(from_artist_id, to_artist_id, relationship)
DO UPDATE SET
  weight = MAX(influence_edges.weight, excluded.weight),
  updated_at = datetime('now')
```

Each discovery appends a new source record, so the edge accumulates evidence over time.

### BFS Path-Finding

The `find_cached_path` tool uses a recursive CTE (Common Table Expression) to perform breadth-first search across the entire cached graph. It traverses edges in both directions and prevents cycles using path-string tracking. The result is the **shortest path** between any two cached artists — returned instantly from local SQLite, no web searches needed.

### Tools

| Tool | Description |
|------|-------------|
| `cache_influence` | Save a single edge with evidence. Upserts on conflict. |
| `cache_batch_influences` | Save multiple edges in one transaction (after extract_influences). |
| `lookup_influences` | Query cached neighbors. Filter by direction, type, weight. |
| `find_cached_path` | BFS shortest path between two cached artists. Instant. |
| `search_cached_artists` | Search cached artist names. |
| `influence_graph_stats` | Graph totals, breakdowns, most-connected artists. |
| `add_artist_alias` | Register alternate names ("Ye" → "Kanye West"). |
| `remove_cached_edge` | Delete incorrect edges. |

### Example Prompts

**Cache-first lookup:**
```
"Who influenced Radiohead? Check what we already know."
```
Crate queries `lookup_influences` for Radiohead's incoming edges. If cached connections exist (from previous sessions), it returns them instantly with source citations. If the cache is sparse, it offers to enrich by searching live sources and caching the results.

**Instant path-finding:**
```
"Is there a cached path between Miles Davis and Kendrick Lamar?"
```
Crate runs BFS across the local graph. If previous queries have built edges connecting jazz → hip-hop through bridge artists like Robert Glasper or Kamasi Washington, the path is returned in milliseconds.

**Graph exploration:**
```
"Show me the influence graph stats — how big is my discovered network?"
```
Returns totals: 247 artists, 512 edges, 1,038 source citations. Breakdown by type: 203 influenced, 156 co_mention, 89 similar, 42 collaboration, 22 sample. Most-connected: Brian Eno (34 connections), David Bowie (28), Aphex Twin (23).

**Alias management:**
```
"Add an alias so 'Ye' maps to 'Kanye West' in the influence cache"
```
Future lookups for "Ye" will resolve to the same artist node as "Kanye West", consolidating all edges.

**Building the graph over time:**
```
"Research the Detroit techno family tree — search for reviews of
Juan Atkins, Derrick May, and Kevin Saunderson, extract all influence
connections, and cache everything you find."
```
Crate searches reviews for all three artists, extracts dozens of co-mentions (Kraftwerk, Parliament, Giorgio Moroder, Underground Resistance, Carl Craig...), and caches the entire web of connections. Future queries about Detroit techno return instant results.

---

## Why This Matters: Beyond the Algorithm

### The Problem with Streaming Recommendations

Spotify's Discover Weekly, Apple Music's personal mixes, and YouTube's recommendation engine all share the same foundation: **collaborative filtering**. They answer the question: *"People who listened to X also listened to Y."*

This approach has well-documented limitations:

| Limitation | What Happens | Example |
|-----------|--------------|---------|
| **Popularity bias** | Recommendations converge on popular artists | Ask for "artists like Autechre" → get Aphex Twin, Boards of Canada (obvious answers) |
| **Filter bubbles** | Listeners get trapped in sonic neighborhoods | A jazz listener never discovers post-punk connections |
| **No context or reasoning** | Recommendations are black boxes | "Because you listened to X" explains nothing about *why* |
| **Missing cross-genre bridges** | Algorithms struggle with genre-spanning connections | The link between krautrock and hip-hop through sampling is invisible |
| **Recency bias** | Older, canonical influences get buried | New releases dominate, historical lineage disappears |
| **No provenance** | You can't trace *why* a connection exists | Was it a sample? A collaboration? A critical comparison? |

### How Crate's Approach Differs

Crate's influence network addresses each of these limitations:

**1. Critic-driven, not listener-driven.**
Instead of "people also listened to", Crate uses "critics mentioned together." Music journalists contextualize artists within lineages, scenes, and movements that listening data alone can't capture. A Pitchfork reviewer comparing Burial to Massive Attack encodes decades of UK bass music history in a single sentence.

**2. Evidence-based with full provenance.**
Every connection in Crate's graph has a source: a specific review, a Last.fm similarity score, a MusicBrainz collaboration credit, a Wikipedia biography entry. You can trace *why* two artists are connected and evaluate the strength of the evidence yourself.

**3. Multi-source triangulation.**
Crate doesn't rely on any single signal. It cross-references:
- **Last.fm** listener similarity scores (behavioral data)
- **MusicBrainz** collaboration and band membership records (factual relationships)
- **Genius** sample, cover, and remix relationships (direct musical lineage)
- **Music publication reviews** (critical co-mentions and influence language)
- **Wikipedia** biographical influence lists (documented history)
- **Web search** for niche blogs, alt-weeklies, and forum discussions

A connection supported by three independent sources is far more meaningful than one supported by listening behavior alone.

**4. Cross-genre bridge discovery.**
The `find_bridge_artists` tool is specifically designed to find the artists that connect disconnected musical communities — exactly the connections that collaborative filtering misses because listeners rarely cross genre boundaries in their everyday habits.

**5. Transparent reasoning.**
Crate presents paths with evidence:
```
  Kraftwerk
    │ influenced (Wikipedia: "pioneered electronic pop")
    ▼
  Depeche Mode
    │ co-mentioned (Pitchfork review of OK Computer, 1997)
    ▼
  Radiohead
```
You can see exactly why each link exists and judge the evidence quality.

**6. Grows with your curiosity.**
The influence cache means your personal knowledge graph gets richer with every question you ask. After a month of music research, your cache might contain hundreds of artists and thousands of connections — a personalized map of musical influence built from your specific research interests, not from an opaque algorithm optimizing for engagement.

**7. Historical depth.**
Because Crate draws from music criticism (which inherently contextualizes new music within historical lineage), it naturally surfaces canonical influences that streaming algorithms bury under recency bias. Asking about a 2025 artist will surface connections back to 1970s pioneers if the critics draw those lines.

---

## Integration with Crate's Server Ecosystem

The influence features don't operate in isolation. They're designed to work with Crate's full suite of 15+ MCP servers in a structured research workflow:

### The Influence Research Priority Chain

When you ask an influence question, Crate follows this priority order:

```
1. Influence Cache (lookup_influences, find_cached_path)
   └── Instant, local, free. Check first.
        │
2. Last.fm (get_similar_artists)
   └── Fastest live source. Numeric scores = edge weights.
   └── Results → cache_batch_influences
        │
3. MusicBrainz (get_artist)
   └── Relationships: collaborations, band memberships, producer credits.
   └── Results → cache_influence (relationship: "collaboration")
        │
4. Genius (get_song)
   └── Song relationships: samples, covers, remixes. Direct proof.
   └── Results → cache_influence (relationship: "sample")
        │
5. Influence Tools (search_reviews, extract_influences)
   └── Review-driven co-mention extraction from 23 publications.
   └── Exa semantic discovery enriches sparse results.
   └── Results → cache_batch_influences
        │
6. Web Search (search_web, extract_content)
   └── Niche blogs, alt-weeklies, forum discussions.
   └── Results → cache_influence
        │
7. Wikipedia (get_article)
   └── Biography: "influenced by" and "associated acts" sections.
   └── Results → cache_influence
```

### Cross-Server Workflows

**Influence → Collection:**
After discovering connections, save interesting artists to your record collection:
```
"Research who influenced J Dilla, then add any artists I don't have
in my collection to my wishlist"
```

**Influence → Playlists:**
Build playlists from influence paths:
```
"Trace the path from Fela Kuti to Kendrick Lamar, then build a playlist
with one track from each artist in the chain"
```

**Influence → YouTube:**
Listen to discovered connections:
```
"Who are the bridge artists between shoegaze and ambient?
Play me a track from the top result."
```

**Bandcamp → Influence:**
Map local scene connections:
```
"Search Bandcamp for Milwaukee experimental artists, then check
the influence cache for any connections between them"
```

**News → Influence:**
Extract influence signals from current coverage:
```
"Search recent music news for reviews of the new Floating Points album,
extract the influence signals, and cache them"
```

**Discogs → Influence:**
Cross-reference marketplace data with influence:
```
"Look up Kraftwerk's discography on Discogs, then show me their
cached influence network — who did they influence?"
```

### Visualization Integration

All influence results use Crate's `viz.ts` rendering system, designed for terminal output:

- **Vertical paths** with `│` and `▼` connectors, color-coded by connection type
- **Adjacency lists** with directional arrows (`→` outgoing, `←` incoming, `↔` mutual)
- **Influence webs** grouped by category (influenced by, collaborators, influenced, bridges)
- **Artist cards** with Unicode box-drawing borders
- **Strength bars** (`████████░░ 4/5`) for visual weight representation
- **Inline chains** (`Kraftwerk → Depeche Mode → Radiohead`) for compact display

---

## Architecture Overview

### File Structure

```
src/servers/
├── influence.ts          # Review-driven discovery (4 tools)
├── influence-cache.ts    # Persistent cache layer (8 tools)
├── web-search.ts         # Dual-provider web search (3 tools, shared by influence)
└── index.ts              # Server registry

src/utils/
├── viz.ts                # Terminal visualization (6 render functions)
└── db.ts                 # SQLite database utility (shared)

src/agent/
└── system-prompt.ts      # Influence reasoning instructions + cache-first strategy

src/ui/
└── app.ts                # Progress messages for all 15 influence/cache tools
```

### Data Flow

```
User Question
    │
    ▼
System Prompt (influence reasoning instructions)
    │
    ▼
Agent decides tool strategy (cache-first priority)
    │
    ├──► Influence Cache (SQLite) ──► Instant results
    │
    ├──► Last.fm API ──► Similarity scores ──► Cache
    │
    ├──► MusicBrainz API ──► Relationships ──► Cache
    │
    ├──► Genius API ──► Samples/covers ──► Cache
    │
    ├──► Web Search (Tavily/Exa) ──► Review text
    │         │
    │         ▼
    │    Co-mention extraction (extractArtistMentions)
    │         │
    │         ▼
    │    Influence signals ──► Cache
    │
    └──► Wikipedia API ──► Biography ──► Cache
              │
              ▼
         Formatted response (viz.ts rendering)
```

### Test Coverage

| Test Suite | Tests | Coverage |
|-----------|-------|----------|
| `tests/influence.test.ts` | 26 | Co-mention extraction, influence phrases, false positive filtering, all 4 handlers |
| `tests/influence-cache.test.ts` | 40 | All 8 tools, upserts, alias resolution, BFS path-finding, batch operations, edge cases |
| `tests/web-search.test.ts` | 28 | Both providers, fallback logic, error handling, domain filtering |
| `tests/viz.test.ts` | 19 | All 6 rendering functions, edge cases, color coding |

**Total: 113 tests** across the influence feature set.

---

## References

- **Stell-R Methodology** — *Harvard Data Science Review*, 2025. Demonstrated that artist co-mentions in music reviews are a meaningful proxy for artistic influence, with higher predictive power than collaborative filtering for cross-genre connections.

---

*Built for DJs, record collectors, music journalists, and anyone who believes that understanding where music comes from is as important as discovering where it's going.*
