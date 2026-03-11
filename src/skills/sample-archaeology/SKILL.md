---
name: sample-archaeology
description: Trace sample chains across records — identify original sources, who sampled whom, and production lineage
triggers:
  - "sample"
  - "sampled"
  - "what song is this from"
  - "original sample"
  - "sample chain"
  - "production lineage"
  - "where did this beat come from"
  - "who sampled"
tools_priority: [whosampled, genius, musicbrainz, websearch, discogs, wikipedia, bandcamp]
---

## Workflow

1. WhoSampled `search_whosampled` — find the track on WhoSampled
2. WhoSampled `get_track_samples` — retrieve full sample graph (samples_used + sampled_by)
3. For each sample found, use `get_track_samples` on the source to trace deeper chains
4. Genius `get_song` — retrieve song relationships, lyrics context, production annotations
5. MusicBrainz `get_recording_credits` — production credits, engineer credits
6. Discogs `get_release_full` — original release details, pressing info, production notes
7. Wikipedia context on the original sample source artist/recording
8. WhoSampled `get_artist_connections` — artist-level sampling overview for broader context

## Chain Building

- Build the chain backward: start from the known track, find what it sampled
- Then check what the source track sampled (and so on)
- Also build forward: find who else sampled the same source
- Note whether samples are direct (audio lifted), interpolations (re-recorded), or references

## Synthesis Order

target track details → direct samples used → source recordings with year/artist →
deeper chain (samples of samples) → forward chain (who else sampled these sources) →
production context (who produced, what equipment/era) → cultural significance

## Presentation

- Use arrow chain notation: Source (1970) → Sampled by (1995) → Re-sampled by (2010)
- Include timestamps when available (e.g., "sampled the drum break at 1:32")
- Link to Genius annotations for each connection
- Group by sample type: drums/breaks, vocal hooks, melodic phrases, bass lines
- Highlight the most-sampled breakbeats and sources (Amen break, Funky Drummer, etc.)
