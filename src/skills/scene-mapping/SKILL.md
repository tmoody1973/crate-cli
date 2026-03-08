---
name: scene-mapping
description: Geographic and temporal music scene analysis — map artists, labels, venues, and movements within a city or era
triggers:
  - "scene map"
  - "music scene in"
  - "what was happening in"
  - "map the scene"
  - "artists from"
  - "local scene"
tools_priority: [bandcamp, musicbrainz, lastfm, wikipedia, websearch, discogs]
---

## Workflow

1. Bandcamp `search_bandcamp` with `location` parameter — discover active artists in the target city/region
2. Bandcamp `discover_music` with `location` — find trending releases from that area
3. MusicBrainz `search_artist` with area filter — find artists catalogued under the target location
4. Wikipedia `get_article` on "[City] music scene" or "[Genre] movement" — historical context
5. Last.fm `get_tag_artists` on location-specific tags (e.g., "detroit techno", "seattle grunge")
6. Web search for "[city] music scene [decade]" across music publications
7. Discogs label searches for labels headquartered in the target city

## Synthesis Order

historical roots → key founding artists/labels → peak era and defining releases →
venues and spaces → cross-pollination with other scenes → current state and active artists →
recommended listening path (chronological)

## Presentation

- Use a timeline format when covering multiple decades
- Group artists by sub-genre or era within the scene
- Highlight bridge artists who connected this scene to others
- Include venue names and label rosters where available
- Cite specific albums as entry points for each era
