# Crate — Use Cases & Persona Guide

> **42 tools. 7 data sources. One conversation.**
> This guide shows how real people use Crate — the AI music research agent that replaces a dozen browser tabs with a single terminal session.

---

## What Crate Does

Crate is a conversational AI agent for deep music research. You type natural language queries into a terminal; Crate decides which combination of MusicBrainz, Discogs, Genius, Last.fm, Wikipedia, Bandcamp, and YouTube to query, cross-references the results, and presents a synthesized answer — while streaming audio in the background.

It's not a search engine. It's a researcher that connects dots across sources, remembers what you've told it, and plays music while it works.

**Data sources available out of the box (no API keys):**
- **MusicBrainz** — Canonical metadata, credits, relationships (6 tools)
- **Bandcamp** — Indie/underground releases, scenes, editorial (6 tools)
- **YouTube** — Audio search and background playback via yt-dlp + mpv (4 tools)
- **Wikipedia** — Artist bios, genre history, cultural context (3 tools)

**With free API keys:**
- **Discogs** — Pressings, marketplace pricing, label catalogs, credits (9 tools)
- **Genius** — Writing/production credits, sample chains, annotations (6 tools)
- **Last.fm** — Listener trends, similar artists, community tags (8 tools)

**Slash commands for playback and session control:**

| Command | What it does |
|---------|-------------|
| `/play <query>` | Instant playback — search and stream in one command |
| `/pause` | Toggle pause/resume |
| `/next` `/prev` | Skip tracks in playlist mode |
| `/stop` | Stop playback |
| `/vol [0-150]` | Set or check volume |
| `/np` | Now playing — track, position, duration |
| `/model [name]` | Switch between Sonnet, Opus, Haiku mid-session |
| `/cost` | Session token usage and cost |
| `/servers` | See which data sources are active |
| `/clear` | Clear the terminal |
| `/help` | Show all commands |
| `/quit` | Exit Crate |

---

## The DJ / Radio Programmer

**Who they are:** Working DJs, club residents, radio hosts, playlist curators. They think in terms of sets, transitions, BPM, energy arcs, and "what goes with what." They need to fill 1-4 hours of airtime and make every track choice intentional.

**Why Crate:** Show prep that used to take hours of tab-switching now happens in a single conversation. Build a set, research the artists, trace samples, and preview tracks — without leaving the terminal.

### Case Study 1: Late-Night Jazz Show Prep

**Scenario:** A college radio DJ has a 2-hour late-night jazz slot tomorrow. She wants to build a set around the spiritual jazz revival, mixing classic and contemporary artists.

**Prompts:**

```
Who are the key artists in the spiritual jazz revival? I'm thinking
Kamasi Washington, Shabaka Hutchings — who else should I know about?
```

> *Crate queries Last.fm for similar artists to Kamasi Washington and Shabaka Hutchings, pulls Wikipedia summaries for context on the spiritual jazz movement, and checks MusicBrainz for collaboration relationships between the artists.*

```
Give me a deeper look at Nubya Garcia — discography, who she's
played with, and any Bandcamp releases I might have missed.
```

> *Crate pulls MusicBrainz for her full discography and collaboration credits, Discogs for pressing details and label info, Bandcamp for any indie/self-released material, and Wikipedia for biographical context.*

```
Build me a playlist called "Late Night Spiritual Jazz" with 15-20
tracks mixing classic (Pharoah Sanders, Alice Coltrane) and
contemporary (Kamasi, Shabaka, Nubya). Include some deep cuts,
not just the obvious picks.
```

> *Crate searches MusicBrainz recordings and Last.fm top tracks across all named artists, cross-references Genius for less obvious album cuts, and assembles the playlist with track metadata. The playlist is stored locally for export.*

```
Play that playlist and shuffle it.
```

> *Crate generates an M3U file from the playlist tracks, resolves each via yt-dlp, and streams through mpv with shuffle enabled. Music plays in the background while the conversation continues.*

**Slash commands used:** `/play`, `/np`, `/next`, `/pause`

---

### Case Study 2: Sample Chain Tracing for a Hip-Hop Set

**Scenario:** A DJ is preparing a "Diggin' in the Crates" themed set that pairs hip-hop tracks with the records they sampled. He wants to trace the sample chain for 3-4 classic tracks and find the originals.

**Prompts:**

```
What are the samples in J Dilla's "Donuts"? Give me the original
tracks that were sampled, who performed them, and what year they
came out.
```

> *Crate searches Genius for song relationships (samples) across Donuts tracks, cross-references MusicBrainz for recording credits on the originals, and pulls Discogs for pressing info on the sampled records.*

```
For each sample you found, check if the original is available on
Bandcamp or YouTube so I can preview it.
```

> *Crate searches Bandcamp for each original artist/track and YouTube for playable versions, returning links and availability.*

```
Play "Workinonit" by J Dilla, then play the Dionne Warwick
original it samples back to back.
```

> *Two sequential `/play` commands or agent-driven play_track calls. The DJ hears the sample and the source side by side.*

```
Now find me 5 more hip-hop tracks from the early 2000s that sample
obscure soul and funk records — the kind a crate digger would
appreciate. Include the original sample sources.
```

> *Crate queries Genius for tracks with sample relationships, filters by era, checks Last.fm tags for soul/funk classification on the originals, and presents pairs (hip-hop track + sampled original).*

**What makes this powerful:** No single service connects hip-hop tracks to their sampled sources AND lets you preview both. Crate bridges Genius (sample data), MusicBrainz (credits), Discogs (pressings), and YouTube (playback) in one conversation.

---

### Case Study 3: Discovering New Music for a Club Night

**Scenario:** A resident DJ at a techno club needs fresh tracks for this weekend. She wants to explore what's new on Bandcamp in the minimal/dub techno space.

**Prompts:**

```
What's new on Bandcamp in dub techno and minimal? Show me
releases from the last month.
```

> *Crate calls discover_music on Bandcamp with dub techno/minimal tags, sorted by new, returning recent releases with artist, label, tags, and pricing.*

```
Tell me more about that release on Hypnus Records — what's the
label about, and what else have they put out recently?
```

> *Crate fetches the Bandcamp artist page for the release, searches Discogs for the Hypnus Records label profile and catalog, and pulls Wikipedia if the label has an article.*

```
Search Last.fm for artists similar to Deepchord and Echospace.
I want to find producers in that dub techno world I might not
know yet.
```

> *Crate calls get_similar_artists on Last.fm for both, deduplicates results, and checks Bandcamp for each artist's presence — surfacing the ones with active Bandcamp pages (likely still releasing music).*

```
Play the top-rated track from that Hypnus release.
```

**Slash commands used:** `/play`, `/np`, `/vol 80`

---

### Case Study 4: Live Show Research

**Scenario:** A radio programmer needs to fill an "Artist Spotlight" segment. She wants to pull together a tight 10-minute overview of an artist — bio, key albums, interesting facts — plus a playlist of essential tracks to play during the segment.

**Prompts:**

```
Give me a complete artist profile on Floating Points for a radio
spotlight segment. I need: real name, where he's from, key albums,
notable collaborations, and anything interesting about his
background.
```

> *Crate queries MusicBrainz for discography and relationships, Wikipedia for biographical narrative, Genius for collaboration credits, and Discogs for the full release history with label context.*

```
What's the story behind "Promises" with Pharoah Sanders? How did
that collaboration come together?
```

> *Crate pulls the Wikipedia article for the album, Genius annotations for context, and MusicBrainz for the full credit list.*

```
Build me a 5-track playlist of his essential tracks — mix of solo
work and collaborations. Play it.
```

> *Crate selects tracks from across his discography using Last.fm play counts as a popularity signal, creates the playlist, and starts streaming via mpv.*

---

## The Record Collector

**Who they are:** Vinyl heads, crate diggers, format obsessives. They care about pressings, matrix numbers, label variations, and condition grades. They track what they own, what they want, and what things are worth.

**Why Crate:** Discogs research that used to require clicking through dozens of release pages now happens conversationally. Compare pressings, check prices, and research labels — all while listening to the records in question.

### Case Study 1: Pressing Identification and Valuation

**Scenario:** A collector found a copy of Miles Davis "Kind of Blue" at a flea market. The label is Columbia, but he needs to figure out which pressing it is and what it's worth.

**Prompts:**

```
I have a copy of Miles Davis "Kind of Blue" on Columbia. How do I
identify which pressing this is? What should I look for on the
label and in the runout groove?
```

> *Crate searches Discogs for the master release of Kind of Blue, then pulls get_master_versions filtered to Columbia pressings. It explains the key identifiers: "six-eye" vs "two-eye" label design, mono vs stereo, and common matrix number patterns. Wikipedia provides historical context about the album's pressing history.*

```
It has a six-eye label and the matrix reads "XSM 64094-1A".
What pressing is this and what's it worth?
```

> *Crate narrows to the specific release version on Discogs matching that matrix, calls get_release_full for identifiers and pressing details, and get_marketplace_stats for current lowest price and number for sale. Genius annotations on the album provide additional context about the recording session and pressing history.*

```
Show me how the value has varied across different pressings of
this album — original mono vs stereo, US vs Japanese.
```

> *Crate calls get_master_versions with country and format filters (US mono, US stereo, JP), then get_marketplace_stats for each notable version, presenting a comparison of values.*

```
Play the album so I can listen while I examine the jacket
and label more closely.
```

> *Crate searches YouTube for the full album and streams it via mpv while the collector continues the conversation.*

```
Add this to my collection as a vinyl, rate it 4.5, and tag it
"blue note adjacent", "original pressing", "jazz".
```

> *Crate is informed this is Columbia, not Blue Note — but the user tagged it "blue note adjacent" intentionally. Calls collection_add with all metadata.*

---

### Case Study 2: Label Deep Dive

**Scenario:** A collector is obsessed with the ECM label. She wants to understand the full catalog, identify the most collectible pressings, and find gaps in her collection.

**Prompts:**

```
Give me the complete story of ECM Records — when it started, who
founded it, the recording philosophy, and the key artists on the
roster.
```

> *Crate pulls the Wikipedia article for ECM Records for narrative history, Discogs for the label profile and sublabel hierarchy, and MusicBrainz for the label's artist relationships.*

```
What are the most sought-after ECM pressings? I'm interested in
the early German pressings specifically.
```

> *Crate searches Discogs for ECM label releases filtered by country (Germany) and early catalog numbers, then checks marketplace stats for the highest-priced items. Cross-references MusicBrainz for the artists/albums behind those catalog numbers. Genius provides annotations on the most iconic ECM recordings — session details, production notes from Manfred Eicher's approach.*

```
I already own ECM 1064 (Keith Jarrett, The Koln Concert) and ECM
1028 (Chick Corea, Return to Forever). What should I look for
next in the early catalog?
```

> *Crate searches the ECM label catalog on Discogs filtered to early catalog numbers, excludes what the user already owns (checking collection_search), and ranks recommendations by marketplace demand and cultural significance (Wikipedia + Last.fm listener data).*

```
Search Bandcamp for any ECM-adjacent indie jazz labels — small
labels with a similar aesthetic.
```

> *Crate searches Bandcamp for labels with jazz, ambient, and ECM-related tags, pulls artist pages for promising results, and presents labels with their catalogs and descriptions.*

**What makes this powerful:** Label catalog research usually requires browsing Discogs page by page. Crate cross-references the catalog numbers against marketplace data, Wikipedia context, and the user's own collection in a single conversation.

---

### Case Study 3: Want-List Research

**Scenario:** A collector has been hunting for a specific pressing of Boards of Canada "Music Has the Right to Children" — the original Skam Records UK pressing on vinyl. He wants to understand what he's looking for and what it should cost.

**Prompts:**

```
Tell me about the original pressing of Boards of Canada "Music
Has the Right to Children." I know there's a Skam Records version
and a Warp version — what's the difference?
```

> *Crate searches Discogs for the master release, pulls get_master_versions to show all pressings, and identifies the Skam Records (SKALD 3LP) vs Warp versions. Wikipedia provides context on the album's release history.*

```
What's the Skam pressing going for right now on Discogs?
```

> *Crate finds the specific Skam release on Discogs and calls get_marketplace_stats for current lowest price and number of copies for sale.*

```
How do I verify it's a legit Skam pressing and not a boot?
What identifiers should I check?
```

> *Crate calls get_release_full for the Skam pressing, extracting barcode, matrix/runout info, label design details, and any pressing notes that distinguish authentic copies. Last.fm listener data on the album provides additional context about its cultural significance.*

```
What do Genius annotations say about the album's production?
Any interesting details about the recording process?
```

> *Crate searches Genius for the album and pulls annotations — crowd-sourced and artist-verified details about sampling techniques, studio equipment, and the album's creation story.*

```
Play the album while I think about whether I want to spend
that much.
```

> *Crate searches YouTube for the full album and streams it via mpv.*

**Slash commands used:** `/play`, `/np`, `/vol`

---

### Case Study 4: Collection Inventory and Analysis

**Scenario:** A collector wants to understand the shape of their collection — what genres dominate, which labels appear most often, and where the gaps are.

**Prompts:**

```
Give me my collection stats — how many records, breakdown by
format, and my most common tags.
```

> *Crate calls collection_stats to return totals, format distribution, tag frequency, and rating distribution.*

```
Search my collection for everything tagged "post-punk" and show
me what I have. Include Last.fm listener counts so I can see
what's popular vs. obscure.
```

> *Crate calls collection_search filtered by the "post-punk" tag, returns matching records. Then enriches results with Last.fm listener/play counts for each album, giving a popularity context for the collection.*

```
I think I'm heavy on UK post-punk but light on the US side.
Search Discogs for essential US post-punk releases from 1978-1984
that I'm missing.
```

> *Crate searches Discogs with genre: punk, style: post-punk, country: US, year range 1978-1984. Cross-references against the user's collection to exclude what they already own. Presents the gaps.*

```
Play a mix of tracks from my post-punk collection while I
browse for what's missing.
```

> *Crate reads the collection_search results, builds a quick playlist from the tagged records, and streams via YouTube/mpv in the background.*

```
Add Wire - "Pink Flag" to my want list. Tag it "post-punk",
"essential", "UK". Note: looking for original Harvest pressing.
```

> *Crate calls collection_add with status "want" and the specified tags and notes.*

---

## The Music Journalist

**Who they are:** Writers, bloggers, reviewers, podcast hosts. They need accurate credits, biographical context, and enough depth to write authoritatively — fast. Their output is articles, show prep notes, and exportable research.

**Why Crate:** A single research session replaces hours of tab-switching between Wikipedia, Discogs, Genius, and MusicBrainz. The conversation format matches how journalists actually think through a story.

### Case Study 1: Artist Profile for a Feature Article

**Scenario:** A music journalist is writing a 2,000-word feature on Mdou Moctar for an online publication. She needs a complete picture: biography, discography, cultural context, key collaborators, and critical reception.

**Prompts:**

```
I'm writing a feature on Mdou Moctar. Start with the basics —
who is he, where is he from, how did he get started, and what's
his significance in the broader context of West African guitar
music?
```

> *Crate pulls the Wikipedia article for biographical narrative and cultural context, MusicBrainz for verified metadata (origin, formation, type), and Genius for any artist profile information.*

```
Give me his complete discography with labels, years, and formats.
I need to know what was self-released vs. label releases, and
which albums broke through to international audiences.
```

> *Crate calls MusicBrainz for the full discography (release groups), Discogs for label and format details per release, and Last.fm for listener counts as a proxy for international reach.*

```
Who produced his albums? I'm especially interested in the
relationship with the Sahel Sounds label and any Western
collaborators.
```

> *Crate queries MusicBrainz for recording credits (producer relationships), Discogs for per-release credits, and Genius for production credits. Searches Wikipedia for Sahel Sounds label context.*

```
What has the critical reception been like? Check recent news and
reviews.
```

> *Crate searches Bandcamp Daily for any editorial coverage (features, reviews), and checks Genius annotations for notable critical context.*

```
Export this entire research session as a markdown report titled
"Mdou Moctar — Feature Research."
```

> *Crate would use the export tools (when implemented) to save the accumulated research as a structured markdown file.*

---

### Case Study 2: Scene Report — Detroit Techno to Berlin

**Scenario:** A journalist is writing about the transatlantic connection between Detroit techno and Berlin's club scene. She needs to map the key artists, labels, and venues that link the two cities.

**Prompts:**

```
Map the key figures in the Detroit-Berlin techno connection.
Start with the original Detroit producers who had their biggest
impact in Europe.
```

> *Crate queries Wikipedia for articles on Detroit techno, the Belleville Three, and the Berlin club scene. MusicBrainz provides artist relationships and geographic data. Last.fm tags help identify artists in the "detroit techno" taxonomy.*

```
What labels operated in both cities? I'm thinking Tresor, but
who else bridged the gap?
```

> *Crate searches Discogs for labels associated with both Detroit and Berlin artists, pulls label profiles for Tresor, Underground Resistance's European distribution, and other cross-Atlantic labels. Wikipedia provides label histories.*

```
Give me the timeline: when did Detroit techno first land in
Berlin, which clubs were the first to play it, and how did
the sound evolve once it got there?
```

> *Crate pulls Wikipedia articles for Tresor (club), the Berlin club scene history, and the broader techno timeline. Cross-references MusicBrainz for release dates of key records that mark the timeline.*

```
Find me 3-4 contemporary artists who represent this Detroit-Berlin
connection today — producers who are active now and bridge both
scenes.
```

> *Crate searches Last.fm for artists tagged with both "detroit techno" and "berlin" or related tags, checks Bandcamp for their recent releases, and pulls Wikipedia summaries for the most notable results.*

```
Play me a track from each of those contemporary artists so I can
hear the current state of the sound.
```

> *Crate searches YouTube for a representative track from each artist and queues them via play_playlist. `/next` to skip between them while taking notes.*

---

### Case Study 3: Credits Research for a Sample-Clearing Story

**Scenario:** A journalist is writing about the economics and legal complexities of sample clearance in hip-hop. She needs detailed sample data for several high-profile tracks.

**Prompts:**

```
Give me the complete sample breakdown for The Avalanches
"Since I Left You" — how many samples, where did they come
from, and which were the hardest to clear?
```

> *Crate searches Genius for song relationships (samples) across the album's tracks, cross-references MusicBrainz for the original recordings' full credit chains, and pulls Wikipedia for the well-documented story of the album's sample clearance process.*

```
Now do the same for DJ Shadow "Endtroducing....." — I want to
compare the two albums' approaches to sample-based composition.
```

> *Same multi-source workflow: Genius for sample data, MusicBrainz for credits, Wikipedia for production context.*

```
For each album, find the most obscure sample source — the one
that required the deepest crate digging. Give me the full story
on that source record.
```

> *Crate identifies the least-known sampled recordings (by Last.fm play counts), then does a deep dive via Discogs (pressing history, rarity) and Wikipedia (artist background) for each.*

---

### Case Study 4: Bandcamp Daily and Editorial Research

**Scenario:** A blogger wants to stay current with what Bandcamp Daily is covering and find story leads in their editorial content.

**Prompts:**

```
What's been on Bandcamp Daily this week? Show me the latest
features and scene reports.
```

> *Crate calls get_bandcamp_editorial to browse recent articles, returning titles, categories, and summaries.*

```
Read that scene report on the Tokyo underground — give me the
full article and pull out all the artists and releases mentioned.
```

> *Crate calls get_bandcamp_editorial with the article URL to extract the full text and referenced releases. Then searches MusicBrainz and Bandcamp for each mentioned artist to provide additional context.*

```
For the most interesting artist mentioned in that piece, give me
a full profile — discography, collaborators, any Wikipedia
presence.
```

> *Full artist deep dive using all available sources.*

```
Play their most recent release while I draft my own write-up.
```

---

## The A&R / Label Scout

**Who they are:** Label A&R, indie label owners, booking agents, festival programmers. They're looking for undiscovered talent, analyzing artist trajectories, and mapping scenes to identify what's next.

**Why Crate:** Artist evaluation that normally requires checking 5-6 platforms now happens in a single query. Compare catalog depth, listener growth, scene positioning, and live activity in one conversation.

### Case Study 1: Artist Evaluation for Signing

**Scenario:** An indie label owner heard a producer on a Bandcamp compilation and wants to evaluate whether they're worth signing. She needs the full picture: catalog, existing label relationships, listener traction, and live activity.

**Prompts:**

```
Research this artist for me: [artist name]. I found them on a
Bandcamp comp and I want to know everything — existing releases,
what labels they've been on, how much traction they have, and
whether they play live.
```

> *Crate runs a comprehensive search: Bandcamp artist page (catalog, tags, location), MusicBrainz (discography, label relationships, collaboration network), Discogs (full release history with labels), Last.fm (listener counts, play counts, similar artists), and Wikipedia (if notable enough for an article).*

```
How does their listener count on Last.fm compare to similar
artists in their genre? I want to understand if they're
under-the-radar or just small.
```

> *Crate calls get_similar_artists on Last.fm for the artist, then compares listener counts across the peer set. Tags help classify the genre positioning.*

```
Check their Bandcamp — how many releases, are they self-released
or on labels, and do they have a consistent output cadence?
```

> *Crate pulls the Bandcamp artist page for full discography, release dates, labels, and pricing. Analyzes release frequency.*

```
What's the broader scene around this artist? Who are they
connected to, what labels are active in this space, and who
else should I be watching?
```

> *Crate maps the artist's network using MusicBrainz relationships (collaborations, member-of), Last.fm similar artists, and Bandcamp tag-based browsing to identify the surrounding scene.*

```
Play me their most popular track so I can hear what they sound like.
```

> *Crate uses YouTube search_tracks to find the artist's top track, then play_track to stream it directly. Use `/vol 80` to adjust volume while reviewing the research.*

---

### Case Study 2: Label Catalog Analysis

**Scenario:** An A&R wants to understand a competitor label's catalog — who they've signed, what their aesthetic is, and how their releases perform in the market.

**Prompts:**

```
Give me a complete analysis of Stones Throw Records — full
catalog, key artists, genre distribution, and what kind of
releases they focus on.
```

> *Crate pulls the Discogs label profile and full catalog (get_label + get_label_releases), Wikipedia for label history and philosophy, and MusicBrainz for the label's artist roster.*

```
Who are their top 5 most commercially successful artists based
on listener data? And who are their most critically acclaimed?
```

> *Crate cross-references the roster against Last.fm for listener/play counts (commercial proxy) and Genius for annotation density and critical context (acclaim proxy).*

```
What genres and styles do they cover? Are they branching out
from their hip-hop roots?
```

> *Crate analyzes Discogs genre/style tags across the catalog and Last.fm community tags for the roster to map the label's aesthetic range over time.*

```
How does their catalog compare to Brainfeeder in terms of
size, genre range, and artist development?
```

> *Same analysis run for Brainfeeder, then compared side-by-side: catalog size, genre distribution, artist retention, marketplace pricing.*

---

### Case Study 3: Trend Identification Through Tags

**Scenario:** A festival programmer wants to identify emerging scenes and micro-genres to book forward-looking acts.

**Prompts:**

```
What are the most active tags on Bandcamp right now in
electronic music? I want to see what subgenres are
getting the most new releases.
```

> *Crate calls discover_music across multiple electronic subgenre tags on Bandcamp, comparing volume and freshness of results. Also calls get_tag_info for context on each tag.*

```
Drill into "deconstructed club" — who are the key artists,
what labels are they on, and where are they based?
```

> *Crate searches Bandcamp for the tag, pulls artist pages for the top results, and cross-references with Last.fm tag data and MusicBrainz for geographic info.*

```
Now check Last.fm — what tags are trending among listeners
that overlap with "deconstructed club"? I want to find
adjacent scenes.
```

> *Crate calls get_tag_artists on Last.fm for "deconstructed club" and related tags, identifies artists that appear across multiple tag taxonomies, revealing scene adjacencies.*

```
For the top 3 artists you found, check if they have upcoming
shows or festival appearances.
```

> *If the events server is active (with Ticketmaster API key), Crate checks for upcoming shows. Otherwise, it notes the limitation and suggests checking directly.*

---

### Case Study 4: Scene Mapping for a New Market

**Scenario:** A booking agent expanding into South America wants to understand the electronic music scenes in Buenos Aires and Sao Paulo.

**Prompts:**

```
Map the electronic music scenes in Buenos Aires and Sao Paulo.
Key artists, active labels, subgenres, and any venues I should
know about.
```

> *Crate searches Bandcamp with location filters for both cities, MusicBrainz for artists from Argentina and Brazil in electronic genres, Last.fm for geo_top_tracks in both countries, and Wikipedia for articles on the music scenes in both cities.*

```
What are the active Bandcamp labels in Buenos Aires that focus
on electronic music?
```

> *Crate searches Bandcamp for labels in Buenos Aires with electronic/experimental tags, pulls label pages for the most active ones.*

```
For each label you found, give me their top 2-3 artists and
a sense of their sound.
```

> *Crate pulls artist pages from Bandcamp for the key artists on each label, checks Last.fm for tags and similar artist data, and synthesizes a sound profile for each.*

```
Queue up a sampler playlist — one track from each of the top
artists across these labels.
```

> *Crate searches YouTube for each artist's standout track and queues them via play_playlist. Use `/np` to check what's playing, `/next` to skip ahead.*

---

## The Serious Listener

**Who they are:** Music enthusiasts who go deeper than streaming playlists. They research the artists they love, trace influences, understand genre histories, and build intentional listening paths. Not professionals — just people who care.

**Why Crate:** The same cross-referencing power available to professionals, but approachable through natural conversation. Ask a question, follow the thread, play what you discover.

### Case Study 1: Going Deep on a New Discovery

**Scenario:** A listener just heard Ichiko Aoba for the first time and wants to understand her music, where she fits in, and what to listen to next.

**Prompts:**

```
I just discovered Ichiko Aoba and I'm obsessed. Tell me
everything — who is she, what's her background, and what
makes her music distinctive?
```

> *Crate pulls Wikipedia for biographical context, MusicBrainz for verified metadata and discography, and Genius for any artist profile and annotations on her work.*

```
What's the best entry point into her discography? I want to
go chronologically or by consensus best album — what do you
recommend?
```

> *Crate checks Last.fm for listener counts per album (consensus proxy), Discogs for release history, and Genius for critical context. Presents a recommended listening order.*

```
Play her album "Windswept Adan" while we keep talking.
```

> *Crate searches YouTube for the album and streams it via mpv.*

```
Who are similar artists? I want Japanese artists first, then
international artists with a similar feel.
```

> *Crate calls get_similar_artists on Last.fm, then filters and groups by country using MusicBrainz data. Checks Bandcamp for the less well-known suggestions to ensure they're still active.*

```
Tell me about the Japanese folk and ambient scene she comes
from. What's the history, who were the pioneers?
```

> *Crate pulls Wikipedia articles on Japanese folk music, ambient music in Japan, and related movements. MusicBrainz provides the artist network. Last.fm tags help map the scene taxonomy.*

---

### Case Study 2: Building a Genre Education Playlist

**Scenario:** A listener has been curious about Afrobeat but doesn't know where to start beyond Fela Kuti. He wants a guided introduction — history, key artists, essential albums — with a playlist to listen along.

**Prompts:**

```
I want to learn about Afrobeat from the beginning. Give me the
history — where it started, who created it, and how it evolved.
```

> *Crate pulls the Wikipedia article on Afrobeat for comprehensive history, MusicBrainz for Fela Kuti's discography and key collaborators (Tony Allen, etc.), and Genius for cultural context.*

```
Beyond Fela and Tony Allen, who are the essential artists I
need to know? Give me the lineage from the 1970s to today.
```

> *Crate queries Last.fm for artists tagged "afrobeat" sorted by listener count, MusicBrainz for artist relationships (influence chains, band membership), and Wikipedia for the key figures in the lineage.*

```
Build me a chronological playlist — "Afrobeat 101" — that
traces the evolution from Fela through to contemporary artists
like Antibalas and Mdou Moctar. 15 tracks.
```

> *Crate selects tracks spanning the timeline using MusicBrainz recording dates, Last.fm for popularity/importance weighting, and creates the playlist in chronological order.*

```
Play it from the beginning. I want to hear the evolution.
```

> *Crate exports the playlist to M3U and streams via mpv in order (no shuffle).*

**Slash commands used:** `/play`, `/np`, `/next` (to skip forward through the chronology)

---

### Case Study 3: Following a Producer's Fingerprint

**Scenario:** A listener noticed that several of her favorite albums were produced by the same person (Brian Eno). She wants to trace his production work across artists and genres.

**Prompts:**

```
Give me a complete list of albums Brian Eno has produced for
other artists — not his solo work, just his production credits.
```

> *Crate queries MusicBrainz for Brian Eno's recording relationships filtered to producer credits, cross-references with Discogs for label and year data, and Genius for any additional production credits.*

```
Group those by decade. I want to see how his production style
moved from rock (Talking Heads, Bowie) to ambient and beyond.
```

> *Crate organizes the results chronologically and by genre using Last.fm tags and Discogs genre metadata, presenting a decade-by-decade narrative.*

```
Pick one album from each decade that best represents his
production approach at that time. Explain why.
```

> *Crate selects representative albums using a combination of critical significance (Wikipedia, Genius annotations) and distinctiveness within the decade's output.*

```
Build a playlist with one track from each of those
representative albums and play it.
```

> *Crate searches for the tracks, builds the playlist, and streams it.*

---

### Case Study 4: Discovering Music by Mood and Context

**Scenario:** A listener wants music for a specific context — late-night reading, rainy Sunday morning, focused work — and wants something more intentional than an algorithmic playlist.

**Prompts:**

```
I need music for late-night reading — something ambient,
textural, not distracting. No vocals. I already know Brian
Eno's ambient work and Stars of the Lid.
```

> *Crate calls get_similar_artists on Last.fm for both Brian Eno and Stars of the Lid, filters results by "ambient" and "instrumental" tags, excludes artists the user already mentioned, and checks Bandcamp for active ambient artists with recent releases.*

```
What about Japanese ambient? I keep seeing that mentioned but
don't know where to start.
```

> *Crate searches Last.fm for artists at the intersection of "japanese" and "ambient" tags, pulls Wikipedia for the key figures (Hiroshi Yoshimura, Midori Takada), checks Bandcamp for availability and recent reissues, and Discogs for original pressings and reissue labels.*

```
Play Hiroshi Yoshimura "Music for Nine Post Cards" — I've
heard it mentioned everywhere.
```

> *Crate searches YouTube and streams via mpv.*

```
While that plays, tell me more about the "kankyō ongaku"
(environmental music) movement. What was it, who were the
key figures, and why is it having a revival now?
```

> *Crate pulls the Wikipedia article on kankyō ongaku, MusicBrainz for the key artists' discographies, and Bandcamp for recent reissues (Light in the Attic, etc.) that explain the revival.*

**What makes this powerful:** The listener went from a vague mood request to a deep cultural education — all while listening to the music being discussed. No tab-switching, no algorithm, just a conversation that follows curiosity.

---

## Advanced Workflows

These patterns work across all personas and demonstrate Crate's cross-referencing strength.

### Multi-Source Cross-Referencing

**Pattern:** Ask a question that no single database can answer.

```
Who played bass on Radiohead's "The National Anthem," and what
other notable recordings has that bassist appeared on? Include
any jazz or classical credits.
```

> *MusicBrainz for the recording credits → identifies the bassist → MusicBrainz again for their full credit history → Discogs for additional session credits → Wikipedia for biographical context.*

### Sample Chain Tracing

**Pattern:** Follow samples through multiple generations.

```
Trace the sample chain for Kanye West's "Bound 2." What's the
original source, has the original been sampled by anyone else,
and what's the full family tree?
```

> *Genius for Bound 2's sample data → identifies the Ponderosa Twins Plus One original → Genius again for other tracks that sampled the same source → MusicBrainz for credits on each track in the chain.*

### Scene Mapping Across Decades

**Pattern:** Track how a scene evolved geographically and sonically over time.

```
Map how the UK garage scene evolved from the early 90s to
present day. Include the key transitions: speed garage → 2-step
→ grime → dubstep → UK bass. Who were the bridge figures at
each transition?
```

> *Wikipedia for the genre evolution narrative → MusicBrainz for key artists at each transition point → Last.fm for tag-based scene mapping → Discogs for label histories that track the transitions.*

### Label Catalog Forensics

**Pattern:** Understand a label's identity through its catalog.

```
Compare the first 20 releases on Warp Records vs the first 20
on Hyperdub. What do the catalogs tell us about each label's
aesthetic and A&R philosophy?
```

> *Discogs for both label catalogs sorted by catalog number → MusicBrainz for artist details → Last.fm tags for genre classification → Wikipedia for label histories. Synthesized into a comparative analysis.*

### Playlist-Driven Research

**Pattern:** Build a playlist, then research what you built.

```
Build me a playlist of 10 tracks that trace the influence of
dub reggae on electronic music — from King Tubby through Basic
Channel to modern producers. Play it, and while it plays, give
me the story behind each track and how it connects to the next.
```

> *Crate builds the playlist using knowledge from all sources, starts playback, then provides track-by-track narration as the music plays — each track's context informed by MusicBrainz credits, Wikipedia history, Genius annotations, and Last.fm relationships.*

---

## Prompt Crafting Tips

### Be Specific About What You Want

| Instead of | Try |
|-----------|-----|
| "Tell me about Radiohead" | "Give me Radiohead's complete discography with producers and labels for each album" |
| "What's good in jazz?" | "Who are the most active jazz artists on Bandcamp releasing vinyl in the last year?" |
| "Play something good" | "Play the highest-rated track from Madlib's last 3 albums" |

### Name Your Sources

Crate picks sources automatically, but you can guide it:

```
Check Discogs for the marketplace value of this pressing.
```

```
What does Last.fm say about similar artists to Burial?
```

```
Is there a Wikipedia article on the history of jungle music?
```

### Ask for Comparisons

Crate excels at cross-referencing. Lean into it:

```
Compare the discographies of Four Tet and Caribou — catalog
size, label history, genre range, and collaborators.
```

```
How does the Bandcamp presence of Stones Throw compare to
Brainfeeder? Who's more active there?
```

### Chain Your Questions

Each follow-up builds on the context of the previous answer:

```
> Who produced Kendrick Lamar's "To Pimp a Butterfly"?

> For each producer you mentioned, what are their 3 best-known
  other production credits?

> Which of those producers has the most Bandcamp presence? Are
  any of them releasing independent work there?

> Play the most recent Bandcamp release from any of them.
```

### Use Follow-Ups for Depth

Start broad, then narrow:

```
> Give me an overview of the Chicago footwork scene.

> Who are the top 5 active producers right now?

> Deep dive on DJ Rashad — discography, collaborators, legacy.

> Build me a 10-track footwork playlist mixing classic and
  contemporary. Play it.
```

### Ask Crate to Play While You Research

Music + conversation is Crate's superpower:

```
Play Coltrane's "A Love Supreme" while you tell me the story
behind the recording session.
```

```
Build a playlist of everything we've discussed today and play
it back.
```
