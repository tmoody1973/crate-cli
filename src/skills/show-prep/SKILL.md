---
name: show-prep
description: Radio show preparation — generates station-voiced track context, talk breaks, social copy, and interview prep from a pasted setlist
triggers:
  - "show prep"
  - "prep my show"
  - "prepare my show"
  - "prep my set"
  - "show preparation"
  - "dj prep"
  - "radio prep"
tools_priority: [musicbrainz, discogs, genius, bandcamp, lastfm, ticketmaster, websearch, news]
---

## Station Profiles

Load the station YAML profile matching the user's request (88nine, hyfin, or rhythmlab).
If no station is specified, ask which station before proceeding.
The profile defines voice tone, vocabulary, break length defaults, social hashtags, recurring features, and local context.

Available stations:
- **88Nine** — Warm, eclectic, community-forward. Indie, alternative, world, electronic, hip-hop.
- **HYFIN** — Bold, culturally sharp, unapologetic. Urban alternative, neo-soul, progressive hip-hop, Afrobeats.
- **Rhythm Lab** — Curated, global perspective, deep knowledge. Global beats, electronic, jazz fusion, experimental.

## Input Parsing

Parse the user's message for:
1. **Station name** — "for HYFIN", "for 88nine", "for rhythm lab"
2. **Shift** — morning, midday, afternoon, evening, overnight (default: evening)
3. **DJ name** — "DJ [name]" or infer from user context
4. **Track list** — Lines matching "Artist - Title" or "Artist — Title" pattern
5. **Interview guest** — "interviewing [artist]" or "guest: [artist]"

If tracks are provided, proceed with full prep. If not, ask for the setlist.

## Workflow

### Per-Track Research (parallel for each track)

1. **MusicBrainz** `search_recording` + `get_recording_credits` — canonical metadata, producer, engineer, studio
2. **Discogs** `search_discogs` + `get_release_full` — release year, label, catalog number, album context
3. **Genius** `search_songs` + `get_song` — annotations, verified artist commentary, production context
4. **Bandcamp** `search_bandcamp` + `get_album` — artist statements, liner notes, community tags, independent status
5. **Last.fm** `get_track_info` + `get_similar_tracks` — listener stats, similar tracks, top tags

### Synthesis (per track)

From the raw data, generate:
- **Origin story** — 2-3 sentences on how this track came to be. Not Wikipedia summary — the interesting backstory.
- **Production notes** — Key production details (studio, producer, notable instruments, sonic signature).
- **Connections** — Influences, samples, collaborations, genre lineage. Use influence tracer if available.
- **Lesser-known fact** — The detail listeners can't easily Google. Dig into Genius annotations and Discogs credits.
- **Why it matters** — One sentence answering: why should THIS audience care about this track RIGHT NOW? (Rule 1)
- **Audience relevance** — high / medium / low based on how well the track fits the station's audience profile (Rule 6)
- **Local tie-in** — Check Ticketmaster for upcoming Milwaukee shows by this artist. Search Milwaukee sources for any local connection.

### Talk Break Generation

For each transition point between tracks, generate talk breaks in the station's voice:
- **Short (10-15 sec)** — Quick context before the vocal kicks in
- **Medium (30-60 sec)** — "That was..." with a compelling detail plus segue to next track
- **Long (60-120 sec)** — Fuller backstory connecting the two tracks, with local tie-in if available

Bold the key phrases — the parts that really land on air.
Include pronunciation guides for unfamiliar artist/track names.

### Social Copy

For each track (or the show overall), generate platform-specific posts:
- **Instagram** — Visual-first, 1-2 sentences, station hashtags
- **X/Twitter** — Punchy, single line + hashtag
- **Bluesky** — Conversational, community-oriented

Never reproduce lyrics. Tone matches the station profile.

### Interview Prep (only if guest mentioned)

If the DJ mentions interviewing a guest:
1. Pull comprehensive artist data from all sources
2. Generate questions in three categories: warm-up, music deep-dive, Milwaukee connection
3. Flag common overasked questions to avoid

## Output Format

Output a SINGLE ShowPrepPackage OpenUI component containing all TrackContextCards, TalkBreakCards, SocialPostCards, and InterviewPrepCards as children. This renders as one browsable artifact in the slide-in panel.

## Radio Milwaukee Show Prep Rules

Apply these rules to ALL generated content:
1. Every piece must answer "why does the listener care?" — no slot filling
2. Content is shaped by the station's audience profile
3. Talk breaks are starting points for DJs to develop — not scripts to read
4. Prep is tied to the actual setlist the DJ will play
5. Content is modular — DJs can skip, swap, or reorder cards
6. Rank content by audience relevance — surface the best angles first
