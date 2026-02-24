# Case Study: How Maya Broke Free from the Algorithm

**Persona:** Maya, 28, Brooklyn. Former Spotify Discover Weekly devotee who noticed she's been hearing the same 40 artists recycled in different playlists for two years. She likes Japanese ambient, UK garage, Brazilian MPB, Detroit techno, and jazz — but Spotify keeps feeding her bedroom pop and "chill beats." She wants to go deeper, not wider.

She installs Crate.

---

## Act 1: "What Am I Actually Into?"

Maya starts by telling Crate about herself so it remembers her across sessions.

```
I'm a record collector focused on vinyl. I like Japanese ambient (Hiroshi
Yoshimura, Midori Takada), UK garage (El-B, Zed Bias), classic MPB (Caetano
Veloso, Gal Costa), Detroit techno (Drexciya, Underground Resistance), and
spiritual jazz (Pharoah Sanders, Alice Coltrane). I mostly buy on Bandcamp
and Discogs. Remember this about me.
```

**Tools activated:** `remember_about_user` (Memory) — stores her preferences for all future sessions.

Then she catalogs what she already owns:

```
Add these to my collection:
- Hiroshi Yoshimura "Music for Nine Post Cards" vinyl, 1982, owned, rating 5
- Midori Takada "Through the Looking Glass" vinyl, 1983, owned, rating 5
- Drexciya "Neptune's Lair" vinyl, 1999, Tresor, owned, rating 5
- Pharoah Sanders "Karma" vinyl, 1969, Impulse!, owned, rating 5
```

**Tools activated:** `collection_add` x4 (Collection)

```
Show me my collection stats
```

**Tools activated:** `collection_stats` — shows totals by format, decade, average rating, top tags.

---

## Act 2: "Who Influenced My Favorites?"

Maya wants to understand why she likes what she likes — and trace where it leads.

```
Trace the influence path from Pharoah Sanders to Floating Points
```

**Tools activated:**

1. `lookup_influences` (Influence Cache) — checks local graph first
2. `get_similar_artists` (Last.fm) — numeric similarity scores
3. `get_artist` (MusicBrainz) — collaboration/relationship data
4. `trace_influence_path` (Influence) — searches 26 publications, extracts co-mentions, finds the chain
5. `cache_batch_influences` (Influence Cache) — saves discovered connections for next time

**What Crate returns:** A formatted chain:

```
Pharoah Sanders → Sun Ra Arkestra → Don Cherry → Four Tet → Floating Points

Evidence:
- Pharoah Sanders → Sun Ra: MusicBrainz (Arkestra member), Last.fm similarity 0.72
- Sun Ra → Don Cherry: Pitchfork review co-mention, shared Impulse! label lineage
- Don Cherry → Four Tet: The Quietus review — "Kieran Hebden cites
  Don Cherry's Organic Music Society as a foundational record"
- Four Tet → Floating Points: Last.fm similarity 0.91, collaboration on
  "Promises" (with Pharoah Sanders himself — the circle closes)
```

Maya is hooked. She didn't know Don Cherry was the bridge between spiritual jazz and modern electronic music.

```
Deep dive into Don Cherry's influence web
```

**Tools activated:** `get_artist_info` (Last.fm), `get_artist` (MusicBrainz), `search_reviews` (Influence), `extract_influences` (Influence), `get_summary` (Wikipedia)

---

## Act 3: "Find Me Something New"

Now Maya wants discovery — not "similar artists" but genuinely surprising connections.

```
Who bridges Japanese ambient and Detroit techno?
```

**Tools activated:** `find_bridge_artists` (Influence) — Exa neural search for conceptual crossover, Tavily for genre-specific keywords. Searches 26 publications for artists mentioned in both contexts.

**What Crate returns:** Bridge artists like **Carl Craig** (Detroit techno producer who incorporated ambient textures, cited Ryuichi Sakamoto), **Susumu Yokota** (Japanese producer spanning ambient and techno), and **Jeff Mills** (whose "Planets" series draws on ambient composition).

```
I've never heard of Susumu Yokota. Tell me everything.
```

**Tools activated:**

1. `search_artist` + `get_artist` (MusicBrainz) — discography, collaborations
2. `get_artist_info` (Last.fm) — listener stats, tags, biography
3. `get_article` (Wikipedia) — full career history
4. `get_artist_discogs` + `get_artist_releases` (Discogs) — vinyl pressings, label history
5. `search_bandcamp` (Bandcamp) — check if available on Bandcamp
6. `search_reviews` (Influence) — what critics have said

```
What's the best Susumu Yokota album on vinyl? Is it expensive?
```

**Tools activated:**

1. `search_discogs` (Discogs) — find master release
2. `get_master_versions` (Discogs) — list all pressings
3. `get_marketplace_stats` (Discogs) — current lowest price, number for sale
4. `get_album_info` (Last.fm) — community consensus on best album

Crate tells her *Grinning Cat* and *Sakura* are the consensus picks. *Sakura* has 3 copies on Discogs starting at $45. *Grinning Cat* is a Japan-only pressing, 1 copy at $120.

```
Add Susumu Yokota "Sakura" to my collection as wishlist, vinyl
```

**Tools activated:** `collection_add` (Collection) — status: wishlist

---

## Act 4: "Build Me a Playlist"

Maya wants to hear the connections she's been reading about.

```
Build me a playlist called "Spiritual Machines" — tracks that sit at the
intersection of spiritual jazz and electronic music. Use real tracks only,
pull from Pharoah Sanders, Alice Coltrane, Floating Points, Four Tet,
Susumu Yokota, and Carl Craig. Verify every track.
```

**Tools activated (per artist):**

1. `get_top_tracks` (Last.fm) — verified popular tracks for each artist
2. `search_recording` (MusicBrainz) — cross-reference track names
3. `get_artist_tracks` (Bandcamp) — for independent artists not well-covered by MusicBrainz
4. `playlist_create` (Playlist) — creates "Spiritual Machines"
5. `playlist_add_track` x10-15 (Playlist) — adds only verified tracks
6. `search_tracks` (YouTube) — finds playable URLs for each track

**What Crate returns:** A formatted playlist with verified tracks, each attributed to the tool that confirmed it.

```
Play it
```

**Tools activated:** `playlist_get` → `play_playlist` (YouTube) — streams the entire playlist through mpv, audio-only.

**During playback:**

```
What's playing now?
```

**Tools activated:** `player_control` (action: now_playing)

```
Skip this one
```

**Tools activated:** `player_control` (action: next)

---

## Act 5: "What's Happening Right Now?"

Maya wants to stay current — not just dig into history.

```
What are the latest album reviews from Pitchfork and The Quietus?
```

**Tools activated:** `get_latest_reviews` (News) — pulls from RSS feeds, returns review titles, artists, dates, and links.

```
Search music news for anything about Japanese ambient in 2026
```

**Tools activated:** `search_music_news` (News) — keyword search across 10 RSS feeds.

```
Find me new ambient music coming out of Tokyo on Bandcamp
```

**Tools activated:** `discover_music` (Bandcamp) — tag: "ambient", location: "Tokyo". Returns fresh releases from Tokyo-based artists with prices, formats, and tags.

```
Play some ambient radio while I browse these results
```

**Tools activated:** `search_radio` or `browse_radio` (Radio) — finds ambient stations → `play_radio` — starts streaming live.

---

## Act 6: "Go Deeper on This Song"

Maya finds a track she loves and wants the full story.

```
Tell me everything about Alice Coltrane's "Journey in Satchidananda"
```

**Tools activated:**

1. `search_songs` + `get_song` (Genius) — producers, writers, relationships (who sampled it, who covered it)
2. `get_song_annotations` (Genius) — crowd-sourced explanations of the composition
3. `get_track_info` (Last.fm) — 2.3M listeners, community tags
4. `search_recording` + `get_recording_credits` (MusicBrainz) — full credits: Pharoah Sanders on soprano sax, Rashied Ali on drums, Cecil McBee on bass
5. `get_article` (Wikipedia) — album context, spiritual meaning, impact

```
Who has sampled Journey in Satchidananda?
```

**Tools activated:** `get_song` (Genius) — song relationships reveal samples by DJ Shadow, Common, Madlib, and others.

---

## Act 7: "Export My Research"

Maya's been at it for an hour. She wants to save everything.

```
Export my Spiritual Machines playlist as markdown
```

**Tools activated:** `playlist_export` (format: markdown) — outputs a formatted document with track listing, artists, and notes.

```
Show me all the influence connections we discovered tonight
```

**Tools activated:** `influence_graph_stats` (Influence Cache) — shows total nodes, edges, most-connected artists, breakdown by relationship type.

---

## What Spotify Can't Do

| Capability | Spotify | Crate |
|---|---|---|
| **Why** two artists are connected | "Fans also like" (no explanation) | Traced influence path with cited reviews |
| **Bridge** between genres | Not possible | `find_bridge_artists` with evidence |
| **Vinyl pricing** | Not available | Discogs marketplace stats |
| **Local scene discovery** | City playlists (curated by editors) | Bandcamp location search (direct from artists) |
| **Full credits** | Songwriter only | Producer, engineer, session musicians via MusicBrainz |
| **Sample chains** | Not available | Genius song relationships |
| **Live radio** | Spotify-only stations | 30,000+ independent stations worldwide |
| **Source attribution** | None | Publication, author, date, URL for every claim |
| **Your data** | Locked in Spotify's cloud | Local SQLite — you own everything |
| **Memory across sessions** | Algorithmic (opaque) | Explicit preference storage you control |

---

## The 86-Tool Toolkit at a Glance

Maya used **15 servers** and **40+ distinct tools** in one session without thinking about APIs, keys, or data formats. She just asked questions in plain English and Crate routed to the right sources, cross-referenced results, cached discoveries, and cited its work.

That's the difference between an algorithm that feeds you what it wants you to hear and a research agent that helps you find what you're actually looking for.
