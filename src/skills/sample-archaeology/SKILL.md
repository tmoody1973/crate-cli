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
tools_priority: [genius, musicbrainz, websearch, discogs, wikipedia, bandcamp]
---

## Workflow

1. Genius `search_songs` — find the track, check for sample annotations
2. Genius `get_song` — retrieve song relationships (samples, sampled_in, interpolations, covers)
3. For each sample found, recursively check Genius for the source track's own samples
4. MusicBrainz `get_recording_credits` — production credits, engineer credits for context
5. Web search for "[track name] sample" on WhoSampled domain and music forums
6. Discogs `get_release_full` — original release details, production notes
7. Wikipedia context on the original sample source artist/recording

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
