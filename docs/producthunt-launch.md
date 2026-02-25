# Crate — Product Hunt Launch Guide

> All copy, asset specs, and launch strategy in one place.

---

## 1. Submission Copy

### Product Name
**Crate**

### Tagline (60 char max)
> The most powerful AI agent for music research (47 chars)

**Alternates:**
- "The only agentic AI tool built for music" (41 chars)
- "92 AI-powered tools for deep music research" (46 chars)
- "AI-powered music research agent for the terminal" (50 chars)

### Short Description (260 char max)
> The only agentic AI tool built for music. 92 tools across 17 databases — MusicBrainz, Discogs, Bandcamp, Genius, and more. Influence tracing backed by Harvard research. Every claim cited, every track verified. `npm i -g crate-cli` (231 chars)

### Topics
- Artificial Intelligence
- Developer Tools
- Music
- Open Source
- Command Line Tools

### Links
- **Website:** https://crate-cli.dev
- **GitHub:** https://github.com/tmoody1973/crate-cli
- **npm:** https://www.npmjs.com/package/crate-cli

---

## 2. Maker Comment (~400 words)

```
Hey Product Hunt 👋

I built Crate because I was tired of asking ChatGPT music questions and getting plausible-sounding nonsense back. "Who influenced J Dilla?" — it'll give you a confident answer, but where did that come from? Which critic documented that connection? Which review?

I'm a record collector and DJ, and I wanted an AI that researches music the way I do — by reading reviews, cross-referencing databases, and following the thread from one artist to the next. Not by guessing from training data.

So I built Crate — the only agentic AI tool built specifically for music. It's a terminal-native agent with 92 tools across 17 data sources. You talk to it in natural language, and it searches MusicBrainz, Discogs, Bandcamp, Genius, Last.fm, YouTube, and 11 more sources to answer your questions — citing every claim back to its source.

**What makes it different:**

- **Shows receipts.** Every influence connection is traced through real music publications — Pitchfork, The Wire, Resident Advisor, and 23 more. You get the review URL, the critic's name, and the date. Click through and read it yourself.

- **Harvard-backed methodology.** The influence tracing system is built on research from the Harvard Data Science Review — extracting artist connections from co-mentions in music criticism rather than streaming algorithms.

- **Zero hallucination on tracks.** Every track in a playlist is verified against Bandcamp, MusicBrainz, or YouTube before inclusion. If it can't confirm a track exists, it doesn't include it.

- **Plays music.** Built-in audio player streams from YouTube and thousands of internet radio stations. Queue tracks, control playback, discover stations — without leaving the terminal.

- **Growing knowledge graph.** Influence connections cache in a local SQLite graph. BFS path-finding gives instant results on repeated queries. Your Crate gets smarter the more you use it.

Get started in one command:

    npm install -g crate-cli

The setup wizard walks you through API keys on first run. Only an Anthropic key is required — everything else is optional and adds more sources.

It's fully open source (MIT). I'd love your feedback on what sources to add next and what kinds of music research you'd want to do with it.

Happy digging 🎵
```

---

## 3. Competitive Positioning — Category of One

### The Landscape (researched Feb 2026)

We searched GitHub, Product Hunt, academic papers, and MCP server registries. **No other product combines agentic AI with music research.**

| Tool | What it does | What it doesn't do |
|------|-------------|-------------------|
| **Microsoft MusicAgent** | Audio processing — classification, transcription, generation (academic prototype, EMNLP 2023) | Zero music research. No databases. Not a shipped product. |
| **Suno / Udio / AIVA** | Text-to-music generation — create songs from prompts | Creates music, doesn't research it. No data sources, no citations. |
| **Discogs/Last.fm MCP** | Individual API servers for Claude Desktop | Disconnected building blocks. No cross-referencing, no agent, no unified workflow. |
| **SoulSync** | Automated music download/collection manager (Python/Flask) | No AI, no LLM, no natural language. Automation tool, not research. |
| **Soundcharts / Chartmetric** | Commercial music analytics SaaS for labels/A&R | Industry tools. No agent, no CLI, no influence tracing. Expensive. |
| **Every Noise at Once** | Genre-mapping visualization | Single-purpose web visualization. Not a tool, not an agent. |
| **Crate** | **92 tools, 17 sources, influence tracing, knowledge graph, audio playback, publishing** | **Nothing. It's the only one.** |

### Key Insight for Messaging

Every AI music tool in existence focuses on music **creation** (generating beats, composing, producing). Crate is the only one focused on music **knowledge** — research, discovery, influence, and understanding. This is the core differentiator to emphasize in all PH copy and social posts.

### Why Not Spotify's Algorithm

This is a strong angle for the PH audience. Spotify recommends based on collaborative filtering ("people who listened to X also listened to Y") and audio fingerprinting (tempo, key, energy). This creates filter bubbles and surfaces popular music, not influential music.

**Crate's approach:**
- Traces connections through published music criticism, not listening behavior
- Cites the specific review, critic, and publication for every connection
- Discovers artists that exist outside any single streaming platform
- Builds understanding, not just playlists

**One-liner:** "Spotify follows the crowd. Crate follows the critics."

---

## 4. Screenshot Plan

All images **1270×760px**, dark background (#0a0a0a), captured from actual terminal sessions or the landing page.

| # | Image | What to Capture | Notes |
|---|-------|----------------|-------|
| 1 | **Hero / Title Card** | Crate logo centered on dark background, tagline underneath, `npm install -g crate-cli` in a styled terminal prompt | This is the social share image and first gallery slide. Use landing page hero section as reference. |
| 2 | **Research Query** | Terminal showing a natural language query like "Who produced Madvillainy?" with cross-referenced results from MusicBrainz, Discogs, and Genius | Show multi-source attribution — the "shows receipts" angle |
| 3 | **Influence Tracing** | Influence path from Fela Kuti → Beyoncé (or Brian Eno → Aphex Twin) showing hop-by-hop connections with publication citations | The signature feature. Show confidence scores and source URLs. |
| 4 | **Audio Playback** | Now-playing bar with track title, artist, progress bar, volume level, and "Playing from YouTube" indicator | Show the built-in player — differentiator vs. other AI tools |
| 5 | **Radio Streaming** | Live radio station playing — station name, genre, "LIVE" badge, stream info | Highlights the radio feature for ambient listening |
| 6 | **Collection Management** | Personal record collection view — list of saved albums with stats (total items, genres, labels) | Shows the local library / "crate digging" metaphor |
| 7 | **Publishing** | Split view: CLI command on left, resulting Telegraph page on right | Show the social publishing flow — research → published page |
| 8 | **Onboarding Wizard** | Setup wizard overlay from first run — API key entry step with the guided flow | Shows polish and low friction to get started |

### Capture Instructions

1. Set terminal to **120 columns × 30 rows** minimum
2. Use the default Crate theme (dark bg, amber accents)
3. Crop to exactly **1270×760** after capture
4. Add subtle drop shadow if compositing onto a background
5. No browser chrome — terminal window only (with traffic light dots)

---

## 5. Thumbnail

**Size:** 240×240px

**Design:** Vinyl record icon (already exists as SVG favicon) centered on dark background (#0a0a0a). The record should fill ~80% of the frame. Amber accent (#e8a849) for the label area.

**Source file:** Use the SVG from the favicon at `www/app/favicon.ico` or recreate from the vinyl record SVG used in the site.

---

## 6. Additional Assets

### Twitter/OG Card
- **Size:** 1200×630px
- **Content:** Landing page hero screenshot cropped to dimensions, or a custom card with: Crate logo + tagline + `npm install -g crate-cli` + stats bar (92 Tools / 17 Sources / 26 Publications)
- **Deploy to:** `www/public/og-image.png`
- **Meta tags:** Already configured in `www/app/layout.tsx`

### Demo Video (Optional)
- **Length:** 60–90 seconds
- **Flow:**
  1. `npm install -g crate-cli` → first run wizard (5s)
  2. Natural language query → multi-source response (15s)
  3. Influence trace between two artists (20s)
  4. Play a track from the results (10s)
  5. Publish findings to Telegraph (10s)
  6. End card with install command + GitHub URL (5s)
- **Tool:** Use asciinema or screen recording software
- **Format:** MP4, 1920×1080, dark terminal theme

---

## 7. Launch Strategy

### Timing
- **Best days:** Tuesday, Wednesday, or Thursday
- **Post time:** 12:01 AM PT (Product Hunt resets daily at midnight PT)
- **Avoid:** Mondays (crowded), Fridays (low weekend traffic), holidays

### Pre-Launch Checklist (1 week before)

- [ ] All 8 screenshots captured and cropped to 1270×760
- [ ] Thumbnail (240×240) exported
- [ ] OG image deployed to `www/public/og-image.png`
- [ ] OG meta tags verified with Twitter Card Validator
- [ ] Landing page live at crate-cli.dev with correct stats
- [ ] npm package published and installable (`npm install -g crate-cli`)
- [ ] GitHub README up to date with latest features
- [ ] Demo video recorded (if doing one)
- [ ] Draft PH submission saved (you can save drafts on PH)
- [ ] Maker comment drafted and proofread
- [ ] Social copy drafted (see Section 7)
- [ ] Notify early supporters / beta users about launch date

### Day-Of Playbook

**12:01 AM PT — Submit**
- Publish the PH listing
- Post maker comment immediately

**6:00 AM PT — Social Push**
- Post Twitter/X thread (see below)
- Post LinkedIn announcement
- Share in relevant Discord/Slack communities:
  - Music production communities
  - Developer/CLI tool communities
  - AI agent communities
  - Record collector forums

**12:00 PM PT — Midday Check-in**
- Reply to every PH comment within 1 hour
- Share any interesting conversations on social
- Post a "behind the scenes" thread if engagement is high

**6:00 PM PT — Evening Push**
- Thank voters with a comment update
- Share final standing / milestones
- Post any user testimonials or interesting use cases discovered

**Day After**
- Write a "launch retrospective" post (blog or Twitter thread)
- Follow up with every PH commenter
- Track referral traffic from PH to landing page and npm installs

---

## 8. Social Copy

### Twitter/X Launch Thread

**Tweet 1 (announcement):**
```
I just launched Crate on Product Hunt — the most powerful AI agent for music research.

92 tools, 17 databases, influence tracing backed by Harvard research. The only agentic AI tool built specifically for music.

Every claim cited. Every track verified. No hallucinations.

npm install -g crate-cli

🔗 [Product Hunt link]
```

**Tweet 2 (the problem):**
```
The problem: ask ChatGPT "who influenced J Dilla?" and you get a confident answer with zero sources.

Crate searches 26 music publications in real time and shows you the exact reviews that document each connection. Publication, author, date, URL.
```

**Tweet 3 (differentiator):**
```
Most AI music tools work from frozen training data.

Crate hits live APIs:
→ MusicBrainz for metadata
→ Discogs for vinyl pressings
→ Bandcamp for independent releases
→ Genius for lyrics + annotations
→ Last.fm for listening trends
→ 12 more sources

All cross-referenced in one conversation.
```

**Tweet 4 (influence feature):**
```
The influence tracing feature is built on methodology from the Harvard Data Science Review.

It extracts artist connections from co-mentions in music criticism across 26 publications — not from streaming algorithms or collaborative filtering.

Fela Kuti → Beyoncé? Crate traces the path and cites every hop.
```

**Tweet 5 (vs. Spotify):**
```
Spotify's algorithm: "People who listened to X also listened to Y."

That's collaborative filtering — it follows the crowd and traps you in a bubble of the familiar.

Crate follows the critics. It reads 26 music publications and traces influence through documented reviews, not listening data.

Algorithms follow crowds. Crate follows critics.
```

**Tweet 6 (demo / install):**
```
It plays music too. Built-in audio from YouTube + thousands of internet radio stations.

Queue tracks, stream stations, control playback — without leaving the terminal.

Try it:
npm install -g crate-cli

Open source. MIT licensed.
GitHub: github.com/tmoody1973/crate-cli
```

---

### LinkedIn Post

```
I'm excited to share Crate — an open-source AI agent I've been building for deep music research.

The idea: what if you could ask an AI about music and get cited, verified answers instead of confident guesses?

Crate is a terminal-native agent built on Anthropic's Claude Agent SDK. It connects to 17 music data sources — MusicBrainz, Discogs, Bandcamp, Genius, Last.fm, and more — through 92 specialized tools. Ask it anything about music in natural language, and it cross-references multiple databases to give you research-grade answers.

The standout feature is influence tracing: it maps how artists connect through co-mentions in music criticism across 26 publications, using methodology from the Harvard Data Science Review. Every connection comes with the review URL, critic name, and publication date.

A few things that make it different:
• Every track in a playlist is verified against real databases before inclusion — no hallucinated tracklists
• Built-in audio player streams from YouTube and internet radio
• Local knowledge graph that gets smarter with every query
• Publish your research to the web with one command

It's fully open source (MIT) and installs in one command:
npm install -g crate-cli

Just launched on Product Hunt — would love your feedback:
[Product Hunt link]

#OpenSource #AI #MusicTech #CLI #DeveloperTools
```

---

### Reddit Communities (optional)

Post to relevant subreddits with community-appropriate tone (not promotional):

- **r/commandline** — "I built a terminal AI agent for music research (92 tools, 17 sources)"
- **r/musicproduction** — "Open source CLI that cross-references 17 music databases with AI"
- **r/vinyl** — "Built a CLI for record collectors — searches Discogs, MusicBrainz, Bandcamp + traces influence networks"
- **r/node** — "Built a CLI agent with Anthropic's Claude Agent SDK + MCP — 92 tools across 17 data sources"

---

## 9. Character Count Verification

| Field | Limit | Content | Count | Status |
|-------|-------|---------|-------|--------|
| Tagline | 60 chars | "AI-powered music research agent for the terminal" | 50 | ✅ |
| Description | 260 chars | See Section 1 | 261 | ⚠️ Trim 1 char |
| Maker comment | ~400 words | See Section 2 | ~380 | ✅ |

**Description trim option (260 exact):**
> Crate is a terminal-native AI agent that cross-references 17 music databases — MusicBrainz, Discogs, Bandcamp, Genius, and more — through 92 tools. Influence tracing backed by Harvard research. Every claim cited, every track verified. `npm i -g crate-cli`

---

## 10. Post-Launch Metrics to Track

- Product Hunt upvotes and ranking
- PH referral traffic (check Vercel Analytics)
- npm install count (check npmjs.com/package/crate-cli)
- GitHub stars (before vs. after)
- GitHub issues / feature requests from PH users
- Social media impressions and engagement
- New contributors or PRs from launch exposure
