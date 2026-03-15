# PRESS RELEASE

**FOR IMMEDIATE RELEASE**

---

## Crate: Open-Source AI Agent Brings Research-Grade Music Discovery to the Terminal — Powered by Harvard-Backed Influence Tracing

*82 tools, 15 data sources, 26 publications — a CLI agent built on Anthropic's Claude Agent SDK that discovers music the way critics and collectors do, not algorithms*

---

**February 2026** — Independent developer Tarik Moody today announced **Crate**, an open-source, terminal-native AI agent for deep music research. Built on Anthropic's Claude Agent SDK and the Model Context Protocol (MCP), Crate connects to 15 music data sources — from MusicBrainz and Discogs to Bandcamp and Genius — through 82 specialized tools, giving DJs, record collectors, music journalists, and serious listeners a single conversational interface to the full landscape of recorded music.

Unlike recommendation engines that optimize for engagement metrics, Crate's flagship feature — **influence tracing** — is grounded in peer-reviewed methodology from the *Harvard Data Science Review* (Issue 7.4, Fall 2025). The system maps artistic influence by analyzing co-mentions across 26 music publications, building a knowledge graph from expert criticism rather than user behavior data.

### The Problem: Algorithmic Filter Bubbles

Streaming platforms recommend music based on what users already listen to, creating feedback loops that narrow discovery over time. Music journalists, DJs building sets, and collectors researching pressings need tools that surface genuine artistic lineage — who influenced whom, what scenes cross-pollinated, which collaborations shaped a genre.

"Every recommendation algorithm is optimized to keep you listening to what you already like," said Moody. "Crate is built for people who want to understand music — not just consume it."

### How It Works

Crate runs entirely in the terminal. Users ask natural-language questions and the agent autonomously queries the right sources, cross-references data, and synthesizes answers:

- **"Who played drums on that session?"** — Crate pulls recording-level credits from MusicBrainz, cross-referenced with Discogs session data.
- **"Trace the influence path from Alice Coltrane to Flying Lotus."** — The influence engine searches music criticism across 26 publications, extracts co-mentions, and builds a multi-hop connection chain with cited evidence.
- **"Find Milwaukee experimental jazz artists on Bandcamp."** — Location-filtered discovery surfaces local scenes that streaming algorithms miss entirely.
- **"What are the original vinyl pressings worth?"** — Discogs marketplace data returns real collector pricing.

Every track recommendation is verified against real databases before inclusion — MusicBrainz, Bandcamp, and YouTube confirm a track exists before Crate suggests it. A built-in audio player streams music directly from YouTube and thousands of live radio stations without leaving the terminal.

### Influence Tracing: From Academic Research to Working Software

Crate's influence network implements methodology from Elena Badillo-Goicoechea's paper *"Modeling Artist Influence for Music Selection and Recommendation: A Purely Network-Based Approach"* (Harvard Data Science Review, Fall 2025). The paper proposes building recommendation systems from knowledge graphs extracted from music criticism — mapping how artists connect through reviews, not listening data.

Crate operationalizes this by:

1. **Searching 26 music publications** — Pitchfork, The Quietus, Resident Advisor, Stereogum, The Guardian, NPR, Bandcamp Daily, AllMusic, The Wire, The FADER, Aquarium Drunkard, and more
2. **Extracting co-mentions** — Identifying when critics reference multiple artists in the same review as influence signals
3. **Building a persistent local knowledge graph** — Connections accumulate over time with weighted edges and source attribution
4. **Tracing multi-hop paths** — BFS pathfinding discovers chains like "Sun Ra → Art Ensemble of Chicago → Tortoise → Wilco" with cited evidence at each step

The system uses dual search providers (Tavily for keyword-filtered queries, Exa for neural/semantic discovery) and falls back gracefully based on available API keys.

### Technical Architecture

Crate is built on Anthropic's **Claude Agent SDK**, using the `query()` function for agentic orchestration. Each data source is implemented as an in-process **MCP (Model Context Protocol) server** with Zod-validated tool schemas — the same open protocol that enables tool use across the Claude ecosystem.

**Key technical details:**

- **Runtime:** Node.js / TypeScript
- **Agent framework:** Claude Agent SDK V1 with session persistence
- **Tool protocol:** Model Context Protocol (MCP) — 15 servers, 82 tools
- **Terminal UI:** pi-tui (imperative rendering, not React/Ink)
- **Local storage:** SQLite via better-sqlite3 (collections, playlists, influence cache)
- **Audio:** yt-dlp + mpv for YouTube and radio streaming
- **Memory:** Mem0 for cross-session user context
- **Web scraping:** Cheerio for Bandcamp and editorial content

The entire system runs locally. No data is sent to third-party servers beyond the APIs the user explicitly configures.

### Data Sources

| Source | Tools | Strengths |
|--------|-------|-----------|
| MusicBrainz | 6 | Canonical metadata, recording credits, relationships |
| Discogs | 9 | Vinyl pressings, marketplace pricing, label catalogs |
| Genius | 8 | Lyrics, annotations, songwriter/producer credits |
| Last.fm | 7 | Listener stats, similarity scores, community tags |
| Bandcamp | 7 | Independent artists, location-based discovery, editorial |
| YouTube | 6 | Audio playback, music video search |
| Radio Browser | 4 | 30,000+ live internet radio stations |
| Wikipedia | 3 | Biographical context, genre histories, scene overviews |
| SoundStats | 3 | Audio analysis (tempo, key, energy) |
| Events | 6 | Concert listings, tour dates, festival lineups |
| Influence Network | 4 | Review-driven influence tracing across 26 publications |
| Influence Cache | 8 | Persistent local knowledge graph with BFS pathfinding |
| Web Search | 3 | Dual-provider (Tavily + Exa) open web search |
| Collection | 5 | Personal record library management |
| Memory | 3 | Cross-session preference learning |

### Who It's For

- **Music journalists** researching artist lineage for features and reviews
- **DJs** building sets with verified tracklists and influence connections
- **Record collectors** pricing pressings and exploring label catalogs
- **Researchers** studying genre evolution and artistic influence networks
- **Serious listeners** who want to understand music, not just hear it

### Availability

Crate is free, open-source, and available now on GitHub.

- **Website:** [crate-cli.vercel.app](https://crate-cli.vercel.app)
- **GitHub:** [github.com/tmoody1973/crate-cli](https://github.com/tmoody1973/crate-cli)
- **License:** Open source

The tool requires Node.js and API keys for premium data sources (MusicBrainz and Bandcamp work without any keys). A `.env.example` file documents all available integrations.

### About the Developer

Tarik Moody is the Director of Strategy and Innovation at **Radio Milwaukee**, a public radio music station, and the creator and host of **Rhythm Lab Radio**, a syndicated music discovery show now in its 20th year of broadcast. He has spent two decades at the intersection of music curation, media, and technology — work that shaped exactly the kind of deep-research workflow Crate is built to support.

Moody is not a traditional software engineer. He is a non-technical builder who has won multiple hackathons by combining domain expertise with emerging AI tools. Crate began as a personal tool for the kind of music research he does daily — tracing influence chains, cross-referencing session credits, digging through label catalogs — and grew into a full agent system after discovering that no existing product combined structured music databases with the critical-context research that radio programmers, record store clerks, and music journalists do naturally.

"I've been doing this research by hand for 20 years," said Moody. "Crate is what happens when someone who actually needs these tools gets access to build them."

---

**Media Contact:**
Tarik Moody
Email: [your-email@example.com]
Website: [crate-cli.vercel.app](https://crate-cli.vercel.app)
GitHub: [github.com/tmoody1973/crate-cli](https://github.com/tmoody1973/crate-cli)

**Assets:**
- Product screenshots and architecture diagram available at [crate-cli.vercel.app](https://crate-cli.vercel.app)
- Logo and brand assets available on request

---

*Crate is an independent project and is not affiliated with or endorsed by Anthropic, Harvard Data Science Review, or any of the data sources it connects to. "Claude" and "Claude Agent SDK" are trademarks of Anthropic, PBC.*
