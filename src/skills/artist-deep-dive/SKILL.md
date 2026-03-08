---
name: artist-deep-dive
description: Comprehensive artist research — discography, influences, collaborations, market presence, biographical context
triggers:
  - "deep dive"
  - "tell me everything about"
  - "full research on"
  - "complete profile"
  - "everything you can find"
tools_priority: [musicbrainz, discogs, genius, wikipedia, lastfm, spotify]
---

## Workflow

1. MusicBrainz `get_artist` — canonical metadata, member relationships, begin/end dates
2. Discogs `get_artist_discogs` + `get_artist_releases` — full discography, biography, aliases
3. Wikipedia `get_summary` — biographical and cultural context
4. Genius `get_artist_songs` + `get_artist_info` — production credits, writing credits, sample chains
5. Last.fm `get_top_tags` + `get_similar_artists` — community tagging, listener positioning
6. Spotify `get_top_tracks` + `get_audio_features` on 3 key records — sonic profile

## Synthesis Order

biography → discography highlights → key collaborators → influences and influenced-by →
current market presence → recommended entry points for new listeners
