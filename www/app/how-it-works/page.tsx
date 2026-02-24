"use client";

import Link from "next/link";

/* ── Data ──────────────────────────────────────────────────────────── */

const ACTS = [
  {
    number: 1,
    title: "What Am I Actually Into?",
    description:
      "Maya starts by telling Crate about herself so it remembers her across sessions. Then she catalogs what she already owns.",
    prompts: [
      {
        input: `I'm a record collector focused on vinyl. I like Japanese ambient\n(Hiroshi Yoshimura, Midori Takada), UK garage (El-B, Zed Bias),\nclassic MPB (Caetano Veloso, Gal Costa), Detroit techno (Drexciya,\nUnderground Resistance), and spiritual jazz (Pharoah Sanders,\nAlice Coltrane). I mostly buy on Bandcamp and Discogs.\nRemember this about me.`,
        tools: [{ name: "remember_about_user", server: "Memory" }],
      },
      {
        input: `Add these to my collection:\n- Hiroshi Yoshimura "Music for Nine Post Cards" vinyl, 1982, rating 5\n- Midori Takada "Through the Looking Glass" vinyl, 1983, rating 5\n- Drexciya "Neptune's Lair" vinyl, 1999, Tresor, rating 5\n- Pharoah Sanders "Karma" vinyl, 1969, Impulse!, rating 5`,
        tools: [{ name: "collection_add", server: "Collection", count: 4 }],
      },
      {
        input: "Show me my collection stats",
        tools: [{ name: "collection_stats", server: "Collection" }],
        output:
          "Totals by format, decade, average rating, top tags — all from her local SQLite database.",
      },
    ],
  },
  {
    number: 2,
    title: "Who Influenced My Favorites?",
    description:
      "Maya wants to understand why she likes what she likes — and trace where it leads.",
    prompts: [
      {
        input: "Trace the influence path from Pharoah Sanders to Floating Points",
        tools: [
          { name: "lookup_influences", server: "Influence Cache" },
          { name: "get_similar_artists", server: "Last.fm" },
          { name: "get_artist", server: "MusicBrainz" },
          { name: "trace_influence_path", server: "Influence" },
          { name: "cache_batch_influences", server: "Influence Cache" },
        ],
        output: `Pharoah Sanders → Sun Ra Arkestra → Don Cherry → Four Tet → Floating Points

Evidence:
- Pharoah Sanders → Sun Ra: MusicBrainz (Arkestra member), Last.fm 0.72
- Sun Ra → Don Cherry: Pitchfork co-mention, shared Impulse! lineage
- Don Cherry → Four Tet: The Quietus — "Kieran Hebden cites Don Cherry's
  Organic Music Society as a foundational record"
- Four Tet → Floating Points: Last.fm 0.91, collaboration on "Promises"
  (with Pharoah Sanders himself — the circle closes)`,
      },
      {
        input: "Deep dive into Don Cherry's influence web",
        tools: [
          { name: "get_artist_info", server: "Last.fm" },
          { name: "get_artist", server: "MusicBrainz" },
          { name: "search_reviews", server: "Influence" },
          { name: "extract_influences", server: "Influence" },
          { name: "get_summary", server: "Wikipedia" },
        ],
      },
    ],
    insight:
      "Maya didn't know Don Cherry was the bridge between spiritual jazz and modern electronic music.",
  },
  {
    number: 3,
    title: "Find Me Something New",
    description:
      "Now Maya wants discovery — not \"similar artists\" but genuinely surprising connections.",
    prompts: [
      {
        input: "Who bridges Japanese ambient and Detroit techno?",
        tools: [{ name: "find_bridge_artists", server: "Influence" }],
        output:
          "Carl Craig (Detroit techno producer who cited Ryuichi Sakamoto), Susumu Yokota (Japanese producer spanning ambient and techno), Jeff Mills (whose \"Planets\" series draws on ambient composition).",
      },
      {
        input: "I've never heard of Susumu Yokota. Tell me everything.",
        tools: [
          { name: "search_artist + get_artist", server: "MusicBrainz" },
          { name: "get_artist_info", server: "Last.fm" },
          { name: "get_article", server: "Wikipedia" },
          { name: "get_artist_discogs", server: "Discogs" },
          { name: "search_bandcamp", server: "Bandcamp" },
          { name: "search_reviews", server: "Influence" },
        ],
      },
      {
        input:
          "What's the best Susumu Yokota album on vinyl? Is it expensive?",
        tools: [
          { name: "search_discogs", server: "Discogs" },
          { name: "get_master_versions", server: "Discogs" },
          { name: "get_marketplace_stats", server: "Discogs" },
          { name: "get_album_info", server: "Last.fm" },
        ],
        output:
          "Sakura — 3 copies on Discogs starting at $45. Grinning Cat — Japan-only pressing, 1 copy at $120.",
      },
      {
        input:
          'Add Susumu Yokota "Sakura" to my collection as wishlist, vinyl',
        tools: [{ name: "collection_add", server: "Collection" }],
      },
    ],
  },
  {
    number: 4,
    title: "Build Me a Playlist",
    description:
      "Maya wants to hear the connections she\u2019s been reading about.",
    prompts: [
      {
        input: `Build me a playlist called "Spiritual Machines" — tracks at the\nintersection of spiritual jazz and electronic music. Use real\ntracks only, pull from Pharoah Sanders, Alice Coltrane, Floating\nPoints, Four Tet, Susumu Yokota, and Carl Craig. Verify every track.`,
        tools: [
          { name: "get_top_tracks", server: "Last.fm" },
          { name: "search_recording", server: "MusicBrainz" },
          { name: "get_artist_tracks", server: "Bandcamp" },
          { name: "playlist_create", server: "Playlist" },
          { name: "playlist_add_track", server: "Playlist", count: 12 },
          { name: "search_tracks", server: "YouTube" },
        ],
        output:
          "A formatted playlist with verified tracks, each attributed to the tool that confirmed it.",
      },
      {
        input: "Play it",
        tools: [{ name: "play_playlist", server: "YouTube" }],
        output: "Streams the entire playlist through mpv, audio-only.",
      },
      {
        input: "What's playing now?",
        tools: [{ name: "player_control", server: "YouTube" }],
      },
      {
        input: "Skip this one",
        tools: [{ name: "player_control", server: "YouTube" }],
      },
    ],
  },
  {
    number: 5,
    title: "What\u2019s Happening Right Now?",
    description:
      "Maya wants to stay current — not just dig into history.",
    prompts: [
      {
        input:
          "What are the latest album reviews from Pitchfork and The Quietus?",
        tools: [{ name: "get_latest_reviews", server: "News" }],
        output:
          "Review titles, artists, dates, and links pulled from RSS feeds.",
      },
      {
        input: "Search music news for anything about Japanese ambient in 2026",
        tools: [{ name: "search_music_news", server: "News" }],
      },
      {
        input: "Find me new ambient music coming out of Tokyo on Bandcamp",
        tools: [{ name: "discover_music", server: "Bandcamp" }],
        output:
          "Fresh releases from Tokyo-based artists with prices, formats, and tags.",
      },
      {
        input: "Play some ambient radio while I browse these results",
        tools: [
          { name: "search_radio", server: "Radio" },
          { name: "play_radio", server: "Radio" },
        ],
        output: "Streams live from 30,000+ independent stations worldwide.",
      },
    ],
  },
  {
    number: 6,
    title: "Go Deeper on This Song",
    description:
      "Maya finds a track she loves and wants the full story.",
    prompts: [
      {
        input:
          'Tell me everything about Alice Coltrane\'s "Journey in Satchidananda"',
        tools: [
          { name: "search_songs + get_song", server: "Genius" },
          { name: "get_song_annotations", server: "Genius" },
          { name: "get_track_info", server: "Last.fm" },
          { name: "get_recording_credits", server: "MusicBrainz" },
          { name: "get_article", server: "Wikipedia" },
        ],
        output:
          "Producers, writers, who sampled it, 2.3M listeners, full credits: Pharoah Sanders on soprano sax, Rashied Ali on drums, Cecil McBee on bass.",
      },
      {
        input: "Who has sampled Journey in Satchidananda?",
        tools: [{ name: "get_song", server: "Genius" }],
        output:
          "Song relationships reveal samples by DJ Shadow, Common, Madlib, and others.",
      },
    ],
  },
  {
    number: 7,
    title: "Export My Research",
    description:
      "Maya\u2019s been at it for an hour. She wants to save everything.",
    prompts: [
      {
        input: "Export my Spiritual Machines playlist as markdown",
        tools: [{ name: "playlist_export", server: "Playlist" }],
        output:
          "A formatted document with track listing, artists, and notes.",
      },
      {
        input: "Show me all the influence connections we discovered tonight",
        tools: [{ name: "influence_graph_stats", server: "Influence Cache" }],
        output:
          "Total nodes, edges, most-connected artists, breakdown by relationship type.",
      },
    ],
  },
];

const COMPARISON = [
  {
    capability: "Why two artists are connected",
    spotify: "\u201cFans also like\u201d (no explanation)",
    crate: "Traced influence path with cited reviews",
  },
  {
    capability: "Bridge between genres",
    spotify: "Not possible",
    crate: "find_bridge_artists with evidence",
  },
  {
    capability: "Vinyl pricing",
    spotify: "Not available",
    crate: "Discogs marketplace stats",
  },
  {
    capability: "Local scene discovery",
    spotify: "City playlists (editor-curated)",
    crate: "Bandcamp location search (direct from artists)",
  },
  {
    capability: "Full credits",
    spotify: "Songwriter only",
    crate: "Producer, engineer, session musicians via MusicBrainz",
  },
  {
    capability: "Sample chains",
    spotify: "Not available",
    crate: "Genius song relationships",
  },
  {
    capability: "Live radio",
    spotify: "Spotify-only stations",
    crate: "30,000+ independent stations worldwide",
  },
  {
    capability: "Source attribution",
    spotify: "None",
    crate: "Publication, author, date, URL for every claim",
  },
  {
    capability: "Your data",
    spotify: "Locked in Spotify\u2019s cloud",
    crate: "Local SQLite \u2014 you own everything",
  },
  {
    capability: "Memory across sessions",
    spotify: "Algorithmic (opaque)",
    crate: "Explicit preference storage you control",
  },
];

/* ── Components ────────────────────────────────────────────────────── */

function TerminalBlock({
  input,
  output,
}: {
  input: string;
  output?: string;
}) {
  return (
    <div className="border border-[#222] bg-[#141414] overflow-hidden">
      <div className="flex items-center gap-2 border-b border-[#222] px-4 py-3">
        <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <div className="h-3 w-3 rounded-full bg-[#28c840]" />
        <span className="ml-3 font-[family-name:var(--font-geist-mono)] text-[0.6rem] tracking-wider text-[#555]">
          crate
        </span>
      </div>
      <div className="p-5 font-[family-name:var(--font-geist-mono)] text-sm leading-relaxed">
        <div className="text-[#888]">
          <span className="text-[#e8a849]">crate &gt;</span>{" "}
          <span className="text-[#ededed]">{input}</span>
        </div>
        {output && (
          <div className="mt-4 text-[#888] whitespace-pre-wrap border-l-2 border-[#333] pl-4">
            {output}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolBadge({
  name,
  server,
  count,
}: {
  name: string;
  server: string;
  count?: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 border border-[#333] bg-[#0a0a0a] px-2.5 py-1 font-[family-name:var(--font-geist-mono)] text-[0.65rem]">
      <span className="text-[#e8a849]">{name}</span>
      {count && count > 1 && (
        <span className="text-[#555]">&times;{count}</span>
      )}
      <span className="text-[#555]">{server}</span>
    </span>
  );
}

/* ── Page ──────────────────────────────────────────────────────────── */

export default function HowItWorks() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      {/* Nav */}
      <nav className="fixed top-0 z-50 w-full border-b border-[#222] bg-[#0a0a0a]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="font-[family-name:var(--font-geist-mono)] text-xs tracking-[0.25em] uppercase text-[#888] hover:text-[#ededed] transition-colors"
          >
            Crate
          </Link>
          <div className="flex items-center gap-8">
            <Link
              href="/"
              className="font-[family-name:var(--font-geist-mono)] text-xs tracking-[0.15em] uppercase text-[#888] transition-colors hover:text-[#ededed]"
            >
              Home
            </Link>
            <Link
              href="/influence-demo"
              className="font-[family-name:var(--font-geist-mono)] text-xs tracking-[0.15em] uppercase text-[#888] transition-colors hover:text-[#ededed]"
            >
              Demo
            </Link>
            <a
              href="https://github.com/tmoody1973/crate-cli"
              target="_blank"
              rel="noopener noreferrer"
              className="font-[family-name:var(--font-geist-mono)] text-xs tracking-[0.15em] uppercase text-[#888] transition-colors hover:text-[#ededed]"
            >
              GitHub
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 pt-32 pb-20">
        <div className="mx-auto max-w-4xl">
          <p className="font-[family-name:var(--font-geist-mono)] text-[0.7rem] tracking-[0.25em] uppercase text-[#888] mb-4">
            How It Works
          </p>
          <h1 className="font-[family-name:var(--font-playfair)] text-4xl leading-[1.1] tracking-[-0.02em] sm:text-5xl md:text-6xl mb-6">
            How Maya broke free
            <br />
            from the algorithm.
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-[#888] mb-4">
            A real session with Crate. Seven acts. 40+ tools. Zero
            hallucinated track names. Every claim sourced from music
            criticism, not listening data.
          </p>
          <p className="max-w-2xl text-sm leading-relaxed text-[#555]">
            Maya, 28, Brooklyn. Former Spotify Discover Weekly devotee who
            noticed she&apos;s been hearing the same 40 artists for two
            years. She likes Japanese ambient, UK garage, Brazilian MPB,
            Detroit techno, and jazz — but Spotify keeps feeding her bedroom
            pop and &ldquo;chill beats.&rdquo;
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-6">
        <div className="divider" />
      </div>

      {/* Acts */}
      {ACTS.map((act) => (
        <div key={act.number}>
          <section className="px-6 py-20">
            <div className="mx-auto max-w-4xl">
              {/* Act heading */}
              <p className="font-[family-name:var(--font-geist-mono)] text-[0.7rem] tracking-[0.25em] uppercase text-[#888] mb-4">
                Act {act.number} of 7
              </p>
              <h2 className="font-[family-name:var(--font-playfair)] text-3xl leading-[1.1] tracking-[-0.02em] sm:text-4xl mb-4">
                &ldquo;{act.title}&rdquo;
              </h2>
              <p className="text-base leading-relaxed text-[#888] mb-10 max-w-2xl">
                {act.description}
              </p>

              {/* Prompts */}
              <div className="space-y-10">
                {act.prompts.map((prompt, i) => (
                  <div key={i} className="space-y-4">
                    <TerminalBlock
                      input={prompt.input}
                      output={prompt.output}
                    />

                    {/* Tool badges */}
                    <div className="flex flex-wrap gap-2">
                      {prompt.tools.map((tool, j) => (
                        <ToolBadge
                          key={j}
                          name={tool.name}
                          server={tool.server}
                          count={"count" in tool ? tool.count : undefined}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Insight callout */}
              {act.insight && (
                <div className="mt-10 border-l-2 border-[#e8a849] pl-6">
                  <p className="text-base leading-relaxed text-[#888] italic">
                    {act.insight}
                  </p>
                </div>
              )}
            </div>
          </section>

          <div className="mx-auto max-w-4xl px-6">
            <div className="divider" />
          </div>
        </div>
      ))}

      {/* Comparison: Spotify vs Crate */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <p className="font-[family-name:var(--font-geist-mono)] text-[0.7rem] tracking-[0.25em] uppercase text-[#888] mb-4">
            The Difference
          </p>
          <h2 className="font-[family-name:var(--font-playfair)] text-3xl leading-[1.1] tracking-[-0.02em] sm:text-4xl mb-10">
            What Spotify can&apos;t do.
          </h2>

          {/* Table */}
          <div className="border border-[#222] overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-3 gap-px bg-[#222]">
              <div className="bg-[#141414] px-5 py-3 font-[family-name:var(--font-geist-mono)] text-[0.65rem] tracking-[0.15em] uppercase text-[#555]">
                Capability
              </div>
              <div className="bg-[#141414] px-5 py-3 font-[family-name:var(--font-geist-mono)] text-[0.65rem] tracking-[0.15em] uppercase text-[#555]">
                Spotify
              </div>
              <div className="bg-[#141414] px-5 py-3 font-[family-name:var(--font-geist-mono)] text-[0.65rem] tracking-[0.15em] uppercase text-[#e8a849]">
                Crate
              </div>
            </div>
            {/* Rows */}
            <div className="grid grid-cols-1 gap-px bg-[#222]">
              {COMPARISON.map((row, i) => (
                <div key={i} className="grid grid-cols-3 gap-px">
                  <div className="bg-[#0a0a0a] px-5 py-4 text-sm text-[#ededed]">
                    {row.capability}
                  </div>
                  <div className="bg-[#0a0a0a] px-5 py-4 text-sm text-[#555]">
                    {row.spotify}
                  </div>
                  <div className="bg-[#0a0a0a] px-5 py-4 text-sm text-[#888]">
                    {row.crate}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-6">
        <div className="divider" />
      </div>

      {/* Stats */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-4xl text-center">
          <p className="font-[family-name:var(--font-geist-mono)] text-[0.7rem] tracking-[0.25em] uppercase text-[#888] mb-10">
            One Session
          </p>
          <div className="grid grid-cols-3 gap-px border border-[#222]">
            <div className="bg-[#141414] px-6 py-10">
              <p className="font-[family-name:var(--font-playfair)] text-5xl tracking-[-0.02em] text-[#e8a849] mb-2">
                15
              </p>
              <p className="font-[family-name:var(--font-geist-mono)] text-[0.65rem] tracking-[0.15em] uppercase text-[#555]">
                Servers
              </p>
            </div>
            <div className="bg-[#141414] px-6 py-10">
              <p className="font-[family-name:var(--font-playfair)] text-5xl tracking-[-0.02em] text-[#e8a849] mb-2">
                40+
              </p>
              <p className="font-[family-name:var(--font-geist-mono)] text-[0.65rem] tracking-[0.15em] uppercase text-[#555]">
                Tools Used
              </p>
            </div>
            <div className="bg-[#141414] px-6 py-10">
              <p className="font-[family-name:var(--font-playfair)] text-5xl tracking-[-0.02em] text-[#e8a849] mb-2">
                86
              </p>
              <p className="font-[family-name:var(--font-geist-mono)] text-[0.65rem] tracking-[0.15em] uppercase text-[#555]">
                Total Toolkit
              </p>
            </div>
          </div>
          <p className="mt-8 text-base leading-relaxed text-[#888] max-w-xl mx-auto">
            Maya used 15 servers and 40+ distinct tools in one session
            without thinking about APIs, keys, or data formats. She just
            asked questions in plain English.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-6">
        <div className="divider" />
      </div>

      {/* CTA */}
      <section className="px-6 py-24 text-center">
        <div className="mx-auto max-w-3xl">
          <p className="font-[family-name:var(--font-geist-mono)] text-[0.7rem] tracking-[0.25em] uppercase text-[#888] mb-6">
            Your Turn
          </p>
          <h2 className="font-[family-name:var(--font-playfair)] text-3xl leading-[1.1] tracking-[-0.02em] sm:text-4xl mb-8">
            Stop discovering what the
            <br />
            algorithm wants you to hear.
          </h2>
          <p className="text-base leading-relaxed text-[#888] mb-10 max-w-xl mx-auto">
            Crate is free, open source, and runs entirely on your machine.
            Install it and start asking questions about the music you
            actually care about.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/#get-started"
              className="inline-block border border-[#e8a849] px-8 py-3 font-[family-name:var(--font-geist-mono)] text-xs tracking-[0.2em] uppercase text-[#e8a849] transition-colors hover:bg-[#e8a849] hover:text-[#0a0a0a]"
            >
              Get Started
            </Link>
            <a
              href="https://github.com/tmoody1973/crate-cli"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block border border-[#333] px-8 py-3 font-[family-name:var(--font-geist-mono)] text-xs tracking-[0.2em] uppercase text-[#888] transition-colors hover:border-[#888] hover:text-[#ededed]"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#222] px-6 py-12">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          <p className="font-[family-name:var(--font-geist-mono)] text-[0.6rem] tracking-[0.2em] uppercase text-[#555]">
            Crate CLI &middot; MIT License
          </p>
          <Link
            href="/"
            className="font-[family-name:var(--font-geist-mono)] text-[0.6rem] tracking-[0.2em] uppercase text-[#555] hover:text-[#888] transition-colors"
          >
            &larr; Back to Crate
          </Link>
        </div>
      </footer>
    </div>
  );
}
