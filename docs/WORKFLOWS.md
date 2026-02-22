# Real-World Workflows

How music professionals use Crate in their daily work. These aren't hypothetical — they're the kind of sessions that happen every day at radio stations, labels, and publications.

---

## 1. DJ / Radio Programmer — 88Nine Radio Milwaukee & HYFIN

**Scenario:** It's Wednesday morning. You're programming Friday's 2-hour "Milwaukee Frequencies" show on HYFIN — a mix of local Milwaukee artists and national acts that connect to the city's music scene. You need to build a cohesive setlist that tells a story.

### Session

```
> I'm building a 2-hour show for HYFIN called "Milwaukee Frequencies."
> The theme is Milwaukee's connection to the broader Midwest indie and
> hip-hop scene. Start by finding Milwaukee-based artists on Bandcamp
> with recent releases in the last year.
```

> *Crate searches Bandcamp with location filters for Milwaukee, pulling recent releases across genres. Returns artists with albums, tags, and release dates.*

```
> Good — I see WebsterX, Lakeyah, and a few I don't know. Give me
> background on IshDARR — I've seen the name but never dug in.
> What's his discography, who has he worked with, and how does
> he connect to the broader Milwaukee scene?
```

> *Crate pulls Wikipedia for bio, MusicBrainz for discography and collaborations, Genius for production credits, Last.fm for similar artists and listener data. Cross-references collaborators back to Milwaukee.*

```
> Play his track "Too Bad" while we keep working.
```

> *YouTube search + mpv playback. The now-playing bar appears at the bottom.*

```
/vol 60
```

```
> Now I need to bridge from Milwaukee hip-hop to Chicago. Who are
> the Chicago artists that Milwaukee listeners are also into?
> Use Last.fm similar artist data to find the overlap.
```

> *Crate calls get_similar_artists for the Milwaukee artists already discussed, filters for Chicago-based results via MusicBrainz area data. Maps the overlap zone — artists like Noname, Saba, Smino who bridge both scenes.*

```
> Perfect. Build me a playlist called "Milwaukee Frequencies — Feb 28"
> with this running order:
> 1. WebsterX - Doomsday
> 2. IshDARR - Too Bad
> 3. Lakeyah - Mind Yo Business
> 4. Noname - Song 33
> 5. Saba - Busy / Sirens
> 6. Smino - Anita
> [... continues for 20+ tracks]
```

> *Crate creates the playlist in SQLite, adds each track with position. Confirms the full tracklist.*

```
> Export that as markdown for my show prep doc, and also as M3U
> so I can preview it.
```

> *Crate calls playlist_export twice — markdown for the programming notes, M3U for playback.*

```
> Play the full playlist on shuffle so I can spot-check the flow.
```

> *Crate calls playlist_get, passes tracks to play_playlist with shuffle. Music starts.*

```
/next
/np
```

### What just happened

In one session, the programmer researched local artists, traced scene connections across cities, built a show-ready tracklist with source documentation, and previewed the whole thing — all without leaving the terminal.

---

## 2. Music Journalist — Feature on a Rising Producer

**Scenario:** You're writing a 2,500-word feature for an online publication about a producer who's been quietly shaping a new sound. Your editor wants the piece by Thursday. You need credits, collaborator networks, sample history, and cultural context — and you need it fast.

### Session

```
> I'm writing a feature on Kenny Beats. I need the full picture —
> who he's produced for, how his style has evolved, and what makes
> him significant in the current landscape. Start with his
> production discography.
```

> *Crate queries MusicBrainz for Kenny Beats' recording relationships filtered to producer credits. Cross-references with Discogs for label and release details. Returns a chronological production resume — from early trap beats to his current indie/alternative crossover work.*

```
> That's a lot of credits. Group them by era — his early work
> with CT and 03 Greedo, the Vince Staples / Rico Nasty wave,
> and then his pivot to working with indie artists like JPEGMAFIA
> and Idles. How did his sound change across those phases?
```

> *Crate organizes the credits by year ranges, pulls Last.fm tags for each collaborator to map genre shifts, checks Genius for production notes and interview excerpts. Synthesizes a narrative of stylistic evolution.*

```
> Now the cultural angle — his YouTube show "The Cave." What's
> the significance? Check Wikipedia and any Bandcamp Daily
> coverage for context on how that show changed his profile.
```

> *Wikipedia for biographical context on The Cave's launch and impact. Bandcamp Daily search for any editorial coverage of Kenny Beats or The Cave's guests. Genius for any annotated context.*

```
> I need quotes and critical context. What are the most annotated
> Kenny Beats productions on Genius? The ones where the community
> has written the most about his production choices.
```

> *Crate calls get_artist_songs_genius sorted by popularity, then get_song_annotations for the top results. Returns the most-discussed production moments with community analysis.*

```
> One more thing — who are the producers working in a similar
> space right now? I want to position him in the current
> landscape for the piece.
```

> *Last.fm similar artists, filtered to producers. Cross-checks with MusicBrainz for active artists with recent credits. Returns a peer set: Monte Booker, Kaytranada, Take A Daytrip, etc.*

```
> Great. Let me listen to his work with JPEGMAFIA while I
> start writing. Play "the bends" by JPEGMAFIA.
```

```
/np
```

### What just happened

The journalist gathered a feature's worth of research — chronological credits, genre analysis, cultural context, critical reception, and competitive landscape — in one conversational session. Every fact is traceable to a specific source (MusicBrainz, Genius, Wikipedia). No tab-switching, no copy-pasting between databases.

---

## 3. A&R / Label Scout — Evaluating a Signing

**Scenario:** You're A&R at an indie label. Your head of marketing forwarded you a Bandcamp link from an artist in Atlanta who's been getting buzz on the underground circuit. Before you reach out, you need to know: What's their catalog? Are they locked into a deal? How much traction do they have? Who's in their orbit?

### Session

```
> I'm evaluating an artist for a possible signing: [artist name].
> Found them on Bandcamp. Give me the full picture — catalog,
> existing label relationships, and traction.
```

> *Crate pulls the Bandcamp artist page (full discography, tags, location, pricing). Cross-references MusicBrainz for any registered releases and label relationships. Discogs for any physical releases and which labels pressed them. Last.fm for listener/play counts.*

```
> Are they self-released or do they have existing label deals?
> I need to know if there's a contract situation before I
> reach out.
```

> *Crate analyzes the Bandcamp releases (self-released vs. label releases), checks Discogs credits for label associations, and MusicBrainz for label relationships. Identifies which releases are self-released, which are on labels, and whether there's a consistent label partnership.*

```
> How do their numbers compare to similar artists in their
> genre? I want to know if they're undervalued or if the
> numbers reflect the buzz.
```

> *Crate calls get_similar_artists on Last.fm, then compares listener counts across the peer set. Pulls Bandcamp pricing and sales signals (e.g., "sold out" editions) for market context. Returns a comparative analysis.*

```
> Who else is in their scene? Map the collaborator network —
> who they've worked with, what labels those people are on,
> and whether there's a broader movement I should be
> paying attention to.
```

> *MusicBrainz relationships for collaborations and member-of connections. Last.fm similar artists filtered by the same geo/genre tags. Bandcamp tag browsing for the micro-scene. Returns a network map: artists, their labels, their shared tags.*

```
> Add them to my collection as a "want" with notes:
> "Evaluating for signing. Strong Bandcamp catalog,
> self-released. Atlanta scene. Check back Q2."
```

> *Crate calls collection_add with status "want", the notes, and genre tags. Saved to local SQLite.*

```
> Now find me 3 more artists in that same Atlanta scene who
> are also self-released and have similar traction. I want
> to see the full landscape before I make a move.
```

> *Crate takes the tags and location from the first artist, searches Bandcamp for other Atlanta artists with similar tags and self-released catalogs. Cross-references Last.fm for comparable listener counts. Returns 3 candidates with catalog summaries.*

```
> Play me a track from each of these 4 artists back to back.
> I want to hear the sonic through-line.
```

> *Crate searches YouTube for each artist's top track, queues them as a playlist via play_playlist.*

```
/next
/np
```

### What just happened

The A&R went from a single Bandcamp link to a complete signing evaluation — catalog audit, label situation, competitive positioning, scene mapping, and a listening session — all documented in the collection database for follow-up. Next quarter, they can search their collection for `status:want tag:atlanta` and pick up right where they left off.

---

## The Common Thread

All three workflows share the same pattern:

1. **Ask a question** — Crate cross-references 4-5 databases
2. **Follow the thread** — each answer opens the next question
3. **Save what matters** — playlists and collection entries persist
4. **Listen while you work** — music plays in the background

The terminal never changes. The context never breaks.
