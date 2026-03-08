---
name: vinyl-valuation
description: Vinyl record identification and market valuation — pressing details, matrix numbers, price comparison across markets
triggers:
  - "vinyl value"
  - "how much is this record"
  - "record worth"
  - "vinyl worth"
  - "matrix number"
  - "first pressing"
  - "original pressing"
  - "vinyl valuation"
  - "record valuation"
tools_priority: [discogs, musicbrainz, websearch]
---

## Workflow

1. Discogs `search_discogs` — find the release by title/artist, identify master release ID
2. Discogs `get_master` — get the master release with all versions listed
3. Discogs `get_master_versions` — enumerate all pressings (country, label, year, format)
4. Discogs `get_release_full` on the specific pressing — detailed credits, matrix/runout info, notes
5. Discogs `get_marketplace_stats` — current lowest price, median, highest for that pressing
6. MusicBrainz `get_release` — cross-reference catalog numbers, barcodes, label details
7. If user provides matrix numbers, match against Discogs release notes to identify exact pressing

## Identification Tips

- Matrix/runout numbers are the most reliable pressing identifier
- Country of pressing affects value significantly (Japanese OBI strips, UK originals, etc.)
- Promo copies (with promo stamps/notches) are usually worth less unless very rare
- Colored vinyl, limited editions, and numbered copies command premiums
- Condition grading (VG+, NM, M) dramatically affects price — always ask about condition

## Synthesis Order

identify exact pressing → current market prices (low/median/high) →
pressing history (first press vs reissues) → condition factors →
comparable recent sales if available → recommendation (hold/sell/buy)

## Presentation

- Use a table comparing pressing variants with prices
- Note the specific Discogs release URL for each variant
- Highlight first pressings and notable variants
- Include the number of copies currently for sale and recent sale count
