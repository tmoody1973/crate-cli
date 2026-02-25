"use client";

import Image from "next/image";
import { useState } from "react";

const SOURCES = [
  { name: "MusicBrainz", tools: 6, category: "Metadata" },
  { name: "Bandcamp", tools: 7, category: "Independent" },
  { name: "Discogs", tools: 9, category: "Collectors" },
  { name: "YouTube", tools: 6, category: "Video" },
  { name: "Last.fm", tools: 7, category: "Scrobbles" },
  { name: "Genius", tools: 8, category: "Lyrics" },
  { name: "Spotify", tools: 4, category: "Streaming" },
  { name: "Wikipedia", tools: 3, category: "Encyclopedia" },
  { name: "SoundStats", tools: 3, category: "Analysis" },
  { name: "Events", tools: 6, category: "Live" },
  { name: "Collection", tools: 5, category: "Library" },
  { name: "Web Search", tools: 4, category: "Discovery" },
  { name: "Influence", tools: 3, category: "Research" },
  { name: "Influence Cache", tools: 8, category: "Network" },
  { name: "Memory", tools: 3, category: "Personal" },
  { name: "Telegraph", tools: 5, category: "Publishing" },
  { name: "Tumblr", tools: 5, category: "Blogging" },
];

const PUBLICATIONS = [
  "Pitchfork",
  "The Quietus",
  "Resident Advisor",
  "Stereogum",
  "BrooklynVegan",
  "FACT Magazine",
  "NME",
  "Consequence of Sound",
  "NPR",
  "The Guardian",
  "Sputnikmusic",
  "Goûte Mes Disques",
  "Bandcamp Daily",
  "Tiny Mix Tapes",
  "Rate Your Music",
  "AllMusic",
  "The Wire",
  "The FADER",
  "Aquarium Drunkard",
  "Boomkat",
  "Passion of the Weiss",
  "The Vinyl District",
  "New York Times",
  "Paste Magazine",
  "Exclaim!",
  "PopMatters",
];

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: "#about", label: "About" },
    { href: "#why-crate", label: "Why Crate" },
    { href: "#share", label: "Share" },
    { href: "#mcp", label: "MCP" },
    { href: "#sources", label: "Sources" },
    { href: "#stack", label: "Stack" },
    { href: "#research", label: "Research" },
  ];

  const navHighlightLinks = [
    { href: "/how-it-works", label: "How It Works" },
    { href: "/influence-demo", label: "Demo" },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      {/* Nav */}
      <nav className="fixed top-0 z-50 w-full border-b border-[#222] bg-[#0a0a0a]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="font-[family-name:var(--font-geist-mono)] text-xs tracking-[0.25em] uppercase text-[#888]">
            Crate
          </span>

          {/* Desktop nav */}
          <div className="hidden lg:flex items-center gap-8">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="font-[family-name:var(--font-geist-mono)] text-xs tracking-[0.15em] uppercase text-[#888] transition-colors hover:text-[#ededed]"
              >
                {link.label}
              </a>
            ))}
            {navHighlightLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="font-[family-name:var(--font-geist-mono)] text-xs tracking-[0.15em] uppercase text-[#e8a849] transition-colors hover:text-[#d4963d]"
              >
                {link.label}
              </a>
            ))}
            <a
              href="#get-started"
              className="font-[family-name:var(--font-geist-mono)] text-xs tracking-[0.15em] uppercase text-[#888] transition-colors hover:text-[#ededed]"
            >
              Install
            </a>
            <a
              href="https://github.com/tmoody1973/crate-cli"
              target="_blank"
              rel="noopener noreferrer"
              className="font-[family-name:var(--font-geist-mono)] text-xs tracking-[0.15em] uppercase text-[#888] transition-colors hover:text-[#ededed]"
            >
              GitHub
            </a>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden flex flex-col gap-1.5 p-2"
            aria-label="Toggle menu"
          >
            <span className={`block h-px w-5 bg-[#888] transition-all duration-300 ${mobileMenuOpen ? "translate-y-[3.5px] rotate-45" : ""}`} />
            <span className={`block h-px w-5 bg-[#888] transition-all duration-300 ${mobileMenuOpen ? "opacity-0" : ""}`} />
            <span className={`block h-px w-5 bg-[#888] transition-all duration-300 ${mobileMenuOpen ? "-translate-y-[3.5px] -rotate-45" : ""}`} />
          </button>
        </div>

        {/* Mobile menu */}
        <div
          className={`lg:hidden border-t border-[#222] bg-[#0a0a0a]/95 backdrop-blur-md overflow-hidden transition-all duration-300 ${
            mobileMenuOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="mx-auto max-w-6xl px-6 py-6 flex flex-col gap-4">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="font-[family-name:var(--font-geist-mono)] text-sm tracking-[0.15em] uppercase text-[#888] transition-colors hover:text-[#ededed]"
              >
                {link.label}
              </a>
            ))}
            <div className="border-t border-[#222] pt-4 flex flex-col gap-4">
              {navHighlightLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="font-[family-name:var(--font-geist-mono)] text-sm tracking-[0.15em] uppercase text-[#e8a849] transition-colors hover:text-[#d4963d]"
                >
                  {link.label}
                </a>
              ))}
            </div>
            <div className="border-t border-[#222] pt-4 flex flex-col gap-4">
              <a
                href="#get-started"
                onClick={() => setMobileMenuOpen(false)}
                className="font-[family-name:var(--font-geist-mono)] text-sm tracking-[0.15em] uppercase text-[#888] transition-colors hover:text-[#ededed]"
              >
                Install
              </a>
              <a
                href="https://github.com/tmoody1973/crate-cli"
                target="_blank"
                rel="noopener noreferrer"
                className="font-[family-name:var(--font-geist-mono)] text-sm tracking-[0.15em] uppercase text-[#888] transition-colors hover:text-[#ededed]"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative flex min-h-screen flex-col items-center justify-center px-6 pt-20 overflow-hidden">
        {/* Background image */}
        <Image
          src="/a-c-rDIPPwnnR54-unsplash.jpg"
          alt=""
          fill
          priority
          className="object-cover object-center"
          sizes="100vw"
        />
        {/* Dark overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/75 via-[#0a0a0a]/70 to-[#0a0a0a]" />

        <div className="relative z-10 mx-auto max-w-4xl text-center">
          <Image
            src="/crate-logo.png"
            alt="Crate"
            width={400}
            height={120}
            priority
            className="mx-auto mb-8 w-[200px] sm:w-[280px] md:w-[340px] h-auto drop-shadow-[0_0_24px_rgba(34,197,94,0.15)]"
          />

          <h1 className="font-[family-name:var(--font-playfair)] text-4xl font-normal leading-[1.1] tracking-[-0.02em] sm:text-6xl md:text-7xl lg:text-8xl mb-8">
            The most powerful AI
            <br />
            agent for music.
          </h1>

          <p className="mx-auto max-w-xl text-lg leading-relaxed text-[#b0b0b0] mb-12">
            The only agentic AI tool built for music research. 92 tools
            across 17 sources. Influence tracing powered by Harvard research.
            A terminal agent and MCP server that understands music the way
            critics and collectors do.
          </p>

          <div className="flex flex-col items-center gap-4">
            <div className="border border-[#e8a849]/30 bg-[#0a0a0a]/60 backdrop-blur-sm px-8 py-3 font-[family-name:var(--font-geist-mono)] text-sm">
              <span className="text-[#555]">$</span>{" "}
              <span className="text-[#ededed]">npm install -g crate-cli</span>
            </div>
            <a
              href="#get-started"
              className="font-[family-name:var(--font-geist-mono)] text-[0.65rem] tracking-[0.2em] uppercase text-[#888] transition-colors hover:text-[#e8a849]"
            >
              More install options &darr;
            </a>
          </div>
        </div>

        {/* Stats row */}
        <div className="mx-auto mt-20 grid max-w-3xl grid-cols-3 gap-px border border-[#222]">
          {[
            { number: "92", label: "Tools" },
            { number: "17", label: "Sources" },
            { number: "26", label: "Publications" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-[#141414] px-4 py-6 sm:px-8 sm:py-8 text-center"
            >
              <p className="font-[family-name:var(--font-playfair)] text-4xl sm:text-5xl mb-2">
                {stat.number}
              </p>
              <p className="font-[family-name:var(--font-geist-mono)] text-[0.65rem] tracking-[0.25em] uppercase text-[#888]">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* About */}
      <section id="about" className="px-6 py-32">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-20 md:grid-cols-2">
            <div>
              <p className="font-[family-name:var(--font-geist-mono)] text-[0.7rem] tracking-[0.25em] uppercase text-[#888] mb-6">
                What is Crate
              </p>
              <h2 className="font-[family-name:var(--font-playfair)] text-4xl leading-[1.1] tracking-[-0.02em] sm:text-5xl mb-8">
                The only AI agent
                <br />
                built for music.
              </h2>
              <p className="text-lg leading-relaxed text-[#888]">
                Crate is the most powerful agentic AI tool for music research.
                It connects to 17 data sources — from MusicBrainz and Discogs
                to Bandcamp and Genius — giving you research-grade access to
                the full landscape of recorded music through a single
                conversation.
              </p>
            </div>
            <div className="flex flex-col gap-8 md:border-l border-[#222] md:pl-12">
              {[
                {
                  title: "Ask anything",
                  desc: "Natural language queries across every source. Who played drums on that session? What are the vinyl pressings worth? Where are they touring next?",
                },
                {
                  title: "Build playlists from verified data",
                  desc: "Every track is verified against real databases — not hallucinated. Bandcamp, MusicBrainz, and YouTube confirm existence before inclusion.",
                },
                {
                  title: "Trace influence networks",
                  desc: "Discover how artists connect through shared reviews, collaborations, and critical co-mentions. Powered by methodology from Harvard Data Science Review.",
                },
                {
                  title: "Listen right from the terminal",
                  desc: "Built-in audio player streams tracks from YouTube and live radio from thousands of stations worldwide. Queue playlists, control playback, and discover new stations — without leaving the CLI.",
                },
                {
                  title: "Share your discoveries",
                  desc: "Publish influence chains, artist deep dives, and playlists to Telegraph for instant shareable pages, or post to your Tumblr blog with full markdown formatting and auto-tagging.",
                },
              ].map((item) => (
                <div key={item.title} className="py-4">
                  <h3 className="font-[family-name:var(--font-playfair)] text-xl mb-2">
                    {item.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-[#888]">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-6">
        <div className="divider" />
      </div>

      {/* Why Not ChatGPT */}
      <section id="why-crate" className="px-6 py-32">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 max-w-2xl">
            <p className="font-[family-name:var(--font-geist-mono)] text-[0.7rem] tracking-[0.25em] uppercase text-[#888] mb-6">
              Why Not ChatGPT
            </p>
            <h2 className="font-[family-name:var(--font-playfair)] text-4xl leading-[1.1] tracking-[-0.02em] sm:text-5xl mb-8">
              They guess.
              <br />
              Crate shows receipts.
            </h2>
            <p className="text-lg leading-relaxed text-[#888]">
              General-purpose AI answers music questions from frozen training data.
              Crate searches 26 publications in real time and cites every connection
              back to the review, the critic, and the publication that documented it.
            </p>
          </div>

          <div className="grid gap-px border border-[#222] md:grid-cols-2">
            {/* ChatGPT / Claude / Gemini column */}
            <div className="bg-[#141414] p-8 sm:p-10">
              <p className="font-[family-name:var(--font-geist-mono)] text-[0.65rem] tracking-[0.2em] uppercase text-[#555] mb-6">
                ChatGPT / Claude / Gemini
              </p>
              <div className="flex flex-col gap-5">
                {[
                  {
                    label: "Training data",
                    desc: "Answers from memorized patterns. No way to verify when or where a claim originated.",
                  },
                  {
                    label: "Invented tracks",
                    desc: "Will confidently generate plausible-sounding track names for obscure artists that don't exist.",
                  },
                  {
                    label: "No sources",
                    desc: "\"Aphex Twin was influenced by Kraftwerk\" — but which critic said that? Which review? No link, no proof.",
                  },
                  {
                    label: "Stateless",
                    desc: "Every question starts from zero. No accumulated knowledge. No graph that grows over time.",
                  },
                  {
                    label: "One search provider",
                    desc: "Generic web search, if any. No domain filtering to music publications.",
                  },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="font-[family-name:var(--font-geist-mono)] text-xs text-[#555] mb-1">
                      {item.label}
                    </p>
                    <p className="text-sm leading-relaxed text-[#666]">
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Crate column */}
            <div className="bg-[#0e0e0e] p-8 sm:p-10 md:border-l border-[#222]">
              <p className="font-[family-name:var(--font-geist-mono)] text-[0.65rem] tracking-[0.2em] uppercase text-[#e8a849] mb-6">
                Crate
              </p>
              <div className="flex flex-col gap-5">
                {[
                  {
                    label: "Live sourced evidence",
                    desc: "Searches Pitchfork, The Wire, Resident Advisor, and 23 more publications in real time. Every connection has a URL.",
                  },
                  {
                    label: "Verified tracks only",
                    desc: "Every track is confirmed against Bandcamp, MusicBrainz, or YouTube before inclusion. No hallucinated tracklists.",
                  },
                  {
                    label: "Full attribution",
                    desc: "Publication, article URL, author byline, and date for every claim. Click through and read the source yourself.",
                  },
                  {
                    label: "Persistent knowledge graph",
                    desc: "Connections cache in a local SQLite graph. BFS path-finding gives instant results. The graph gets richer every session.",
                  },
                  {
                    label: "Dual-provider search",
                    desc: "Tavily for keyword precision + Exa for neural semantic discovery. Both constrained to 26 music publications.",
                  },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="font-[family-name:var(--font-geist-mono)] text-xs text-[#e8a849] mb-1">
                      {item.label}
                    </p>
                    <p className="text-sm leading-relaxed text-[#888]">
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom line */}
          <div className="mt-8 border border-[#222] bg-[#141414] px-8 py-6 text-center">
            <p className="font-[family-name:var(--font-playfair)] text-lg leading-relaxed">
              ChatGPT tells you what it <em className="text-[#666]">thinks</em> the connections are.
              <br />
              Crate <span className="text-[#e8a849]">shows you</span> the reviews that prove it.
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-6">
        <div className="divider" />
      </div>

      {/* Category of One */}
      <section className="px-6 py-32">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 max-w-2xl">
            <p className="font-[family-name:var(--font-geist-mono)] text-[0.7rem] tracking-[0.25em] uppercase text-[#e8a849] mb-6">
              Category of One
            </p>
            <h2 className="font-[family-name:var(--font-playfair)] text-4xl leading-[1.1] tracking-[-0.02em] sm:text-5xl mb-8">
              Nothing else
              <br />
              like it exists.
            </h2>
            <p className="text-lg leading-relaxed text-[#888]">
              We looked. Every other AI music tool focuses on <em className="text-[#666]">creating</em> music — generating beats, composing melodies, producing tracks. Not a single one is built for music <em className="text-[#ededed]">research</em>. Crate is the only agentic AI tool that connects to real music databases, traces influence through published criticism, and builds a knowledge graph from verified data.
            </p>
          </div>

          <div className="grid gap-px border border-[#222] sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                name: "Microsoft MusicAgent",
                type: "AI Agent",
                does: "Audio processing — classification, transcription, generation",
                gap: "Zero music research. No databases. Academic prototype, not a shipped product.",
              },
              {
                name: "Suno / Udio / AIVA",
                type: "AI Generation",
                does: "Text-to-music generation — create songs from prompts",
                gap: "Creates music, doesn't research it. No data sources, no citations, no knowledge.",
              },
              {
                name: "Discogs/Last.fm MCP",
                type: "Individual Servers",
                does: "Single-source API access for Claude Desktop",
                gap: "Disconnected building blocks. No cross-referencing, no agent, no unified workflow.",
              },
              {
                name: "Crate",
                type: "The Only One",
                does: "92 tools, 17 sources, influence tracing, knowledge graph, audio playback, publishing",
                gap: "",
              },
            ].map((item) => (
              <div
                key={item.name}
                className={`p-6 sm:p-8 ${item.gap === "" ? "bg-[#0e0e0e] border border-[#e8a849]/30" : "bg-[#141414]"}`}
              >
                <p className={`font-[family-name:var(--font-geist-mono)] text-xs tracking-[0.1em] mb-1 ${item.gap === "" ? "text-[#e8a849]" : "text-[#ededed]"}`}>
                  {item.name}
                </p>
                <p className="font-[family-name:var(--font-geist-mono)] text-[0.6rem] tracking-[0.15em] uppercase text-[#555] mb-4">
                  {item.type}
                </p>
                <p className="text-sm leading-relaxed text-[#888] mb-3">
                  {item.does}
                </p>
                {item.gap && (
                  <p className="text-xs leading-relaxed text-[#555] border-t border-[#222] pt-3">
                    {item.gap}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-8 border border-[#222] bg-[#141414] px-8 py-6 text-center">
            <p className="font-[family-name:var(--font-playfair)] text-lg leading-relaxed">
              Every AI music tool makes music.
              <br />
              Crate is the only one that <span className="text-[#e8a849]">understands</span> it.
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-6">
        <div className="divider" />
      </div>

      {/* Why Not Spotify */}
      <section className="px-6 py-32">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 max-w-2xl">
            <p className="font-[family-name:var(--font-geist-mono)] text-[0.7rem] tracking-[0.25em] uppercase text-[#888] mb-6">
              Why Not Spotify&apos;s Algorithm
            </p>
            <h2 className="font-[family-name:var(--font-playfair)] text-4xl leading-[1.1] tracking-[-0.02em] sm:text-5xl mb-8">
              Algorithms follow crowds.
              <br />
              Crate follows critics.
            </h2>
            <p className="text-lg leading-relaxed text-[#888]">
              Spotify&apos;s algorithm recommends music based on what millions of other people listened to next. That&apos;s great for mainstream hits — but it traps you in a feedback loop of the familiar. Crate discovers connections the way music critics do: by reading reviews, tracing lineage, and following the thread from one artist to the next through documented evidence.
            </p>
          </div>

          <div className="grid gap-px border border-[#222] md:grid-cols-2">
            {/* Spotify column */}
            <div className="bg-[#141414] p-8 sm:p-10">
              <p className="font-[family-name:var(--font-geist-mono)] text-[0.65rem] tracking-[0.2em] uppercase text-[#555] mb-6">
                Spotify / Apple Music / YouTube Music
              </p>
              <div className="flex flex-col gap-5">
                {[
                  {
                    label: "Collaborative filtering",
                    desc: "\"People who listened to X also listened to Y.\" Follows the herd — surfaces what's popular, not what's influential.",
                  },
                  {
                    label: "Audio fingerprinting",
                    desc: "Matches sonic similarity — tempo, key, energy. Misses artistic intent, lyrical lineage, and cultural context entirely.",
                  },
                  {
                    label: "Engagement-optimized",
                    desc: "The algorithm rewards what keeps you listening longer, not what expands your knowledge. Designed for retention, not discovery.",
                  },
                  {
                    label: "Black box",
                    desc: "\"Because you listened to Radiohead\" — but why this specific track? No explanation, no source, no way to understand the connection.",
                  },
                  {
                    label: "Platform-locked",
                    desc: "Only sees its own catalog. Can't cross-reference Bandcamp exclusives, vinyl-only releases, or independent labels outside the platform.",
                  },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="font-[family-name:var(--font-geist-mono)] text-xs text-[#555] mb-1">
                      {item.label}
                    </p>
                    <p className="text-sm leading-relaxed text-[#666]">
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Crate column */}
            <div className="bg-[#0e0e0e] p-8 sm:p-10 md:border-l border-[#222]">
              <p className="font-[family-name:var(--font-geist-mono)] text-[0.65rem] tracking-[0.2em] uppercase text-[#e8a849] mb-6">
                Crate
              </p>
              <div className="flex flex-col gap-5">
                {[
                  {
                    label: "Review-driven discovery",
                    desc: "Connections extracted from 26 music publications. Every link traced to a specific review, critic, and publication date.",
                  },
                  {
                    label: "Cultural context",
                    desc: "Understands why Fela Kuti influenced Beyoncé — the Afrobeat revival, the political messaging, the production choices. Not just \"similar BPM.\"",
                  },
                  {
                    label: "Knowledge-optimized",
                    desc: "Designed to make you smarter about music, not to keep you on a platform. Every session expands your understanding.",
                  },
                  {
                    label: "Full transparency",
                    desc: "Every connection shows the evidence chain: which publication, which review, which critic, what they said. You can verify it yourself.",
                  },
                  {
                    label: "Platform-independent",
                    desc: "Searches across 17 sources — Bandcamp, Discogs, MusicBrainz, YouTube, and more. Finds releases that don't exist on any single platform.",
                  },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="font-[family-name:var(--font-geist-mono)] text-xs text-[#e8a849] mb-1">
                      {item.label}
                    </p>
                    <p className="text-sm leading-relaxed text-[#888]">
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8 border border-[#222] bg-[#141414] px-8 py-6 text-center">
            <p className="font-[family-name:var(--font-playfair)] text-lg leading-relaxed">
              Spotify tells you what the <em className="text-[#666]">crowd</em> listens to.
              <br />
              Crate shows you what the <span className="text-[#e8a849]">critics</span> wrote about.
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-6">
        <div className="divider" />
      </div>

      {/* Crate Social — Telegraph Publishing */}
      <section id="share" className="px-6 py-32">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-20 md:grid-cols-2">
            <div>
              <p className="font-[family-name:var(--font-geist-mono)] text-[0.7rem] tracking-[0.25em] uppercase text-[#888] mb-6">
                Crate Social
              </p>
              <h2 className="font-[family-name:var(--font-playfair)] text-4xl leading-[1.1] tracking-[-0.02em] sm:text-5xl mb-8">
                Publish your finds.
                <br />
                Share with anyone.
              </h2>
              <p className="text-lg leading-relaxed text-[#888] mb-8">
                Every influence chain, artist deep dive, and playlist you research
                can become a public web page — instantly shareable via a simple link.
                Two publishing options to fit your workflow.
              </p>
              <p className="text-lg leading-relaxed text-[#888] mb-4">
                <a
                  href="https://telegra.ph"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#e8a849] hover:text-[#d4963d] transition-colors"
                >
                  Telegraph
                </a>
                {" "}— Telegram&apos;s anonymous publishing platform. Zero friction,
                no account, free forever.
              </p>
              <p className="text-lg leading-relaxed text-[#888]">
                <a
                  href="https://www.tumblr.com/oauth/apps"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#e8a849] hover:text-[#d4963d] transition-colors"
                >
                  Tumblr
                </a>
                {" "}— Post to your own blog with full markdown-to-NPF conversion,
                auto-tagging, and OAuth authentication.
              </p>
            </div>

            <div className="flex flex-col gap-6">
              {/* How it works steps */}
              {[
                {
                  step: "01",
                  title: "Set up your page",
                  desc: "One command creates your Crate social page — a living index of everything you publish. You get a shareable URL instantly.",
                  prompt: "Set up my Crate page",
                },
                {
                  step: "02",
                  title: "Publish anything",
                  desc: "Post influence chains, artist deep dives, playlist notes, or collection highlights. Each entry gets its own page, linked from your index.",
                  prompt: "Post my Pharoah Sanders influence chain to my page",
                },
                {
                  step: "03",
                  title: "Share the link",
                  desc: "Your index page is a public feed of your music discoveries. Send it to friends, drop it in Discord, or pin it in your bio.",
                  prompt: "Show me my Crate page",
                },
              ].map((item) => (
                <div key={item.step} className="border-l border-[#222] pl-6">
                  <p className="font-[family-name:var(--font-geist-mono)] text-[0.6rem] tracking-[0.2em] uppercase text-[#e8a849] mb-2">
                    {item.step}
                  </p>
                  <h3 className="font-[family-name:var(--font-playfair)] text-xl mb-2">
                    {item.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-[#888] mb-3">
                    {item.desc}
                  </p>
                  <p className="font-[family-name:var(--font-geist-mono)] text-xs text-[#555]">
                    <span className="text-[#e8a849]">crate &gt;</span> {item.prompt}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Terminal demo */}
          <div className="mt-20 mx-auto max-w-3xl border border-[#222] bg-[#141414]">
            <div className="flex items-center gap-2 border-b border-[#222] px-4 py-3">
              <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
              <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
              <div className="h-3 w-3 rounded-full bg-[#28c840]" />
              <span className="ml-3 font-[family-name:var(--font-geist-mono)] text-[0.6rem] tracking-wider text-[#555]">
                crate
              </span>
            </div>
            <div className="p-6 text-left font-[family-name:var(--font-geist-mono)] text-sm leading-loose">
              <p className="text-[#888]">
                <span className="text-[#e8a849]">crate &gt;</span> set up my Crate page as &quot;Maya&apos;s Digs&quot;
              </p>
              <p className="mt-3 text-[#555]">Setting up your Crate social page...</p>
              <p className="text-[#ededed]">
                Page created: <span className="text-[#e8a849]">https://telegra.ph/Mayas-Digs-02-24</span>
              </p>
              <p className="mt-4 text-[#888]">
                <span className="text-[#e8a849]">crate &gt;</span> post my Pharoah Sanders to Floating Points influence chain to my page
              </p>
              <p className="mt-3 text-[#555]">Publishing to your Crate page...</p>
              <p className="text-[#ededed]">
                Published: <span className="text-[#e8a849]">https://telegra.ph/Pharoah-Sanders-to-Floating-Points-02-24</span>
              </p>
              <p className="text-[#555]">Index updated with 1 entry</p>
              <p className="mt-4 text-[#888]">
                <span className="text-[#e8a849]">crate &gt;</span>{" "}
                <span className="inline-block w-2 h-4 bg-[#ededed] animate-pulse" />
              </p>
            </div>
          </div>

          {/* Feature tags */}
          <div className="mt-12 flex flex-wrap justify-center gap-3">
            {[
              "No API key needed",
              "Zero signup",
              "Instant URLs",
              "Markdown support",
              "Auto-indexed",
              "Categories & filtering",
            ].map((tag) => (
              <span
                key={tag}
                className="border border-[#222] bg-[#0e0e0e] px-4 py-2 font-[family-name:var(--font-geist-mono)] text-[0.65rem] tracking-[0.15em] uppercase text-[#888]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-6">
        <div className="divider" />
      </div>

      {/* MCP Server Mode */}
      <section id="mcp" className="px-6 py-32">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 max-w-2xl">
            <p className="font-[family-name:var(--font-geist-mono)] text-[0.7rem] tracking-[0.25em] uppercase text-[#888] mb-6">
              MCP Server Mode
            </p>
            <h2 className="font-[family-name:var(--font-playfair)] text-4xl leading-[1.1] tracking-[-0.02em] sm:text-5xl mb-8">
              Use Crate anywhere.
            </h2>
            <p className="text-lg leading-relaxed text-[#888]">
              Run <span className="font-[family-name:var(--font-geist-mono)] text-[#ededed]">crate --mcp-server</span> to
              expose all 92 tools as a standard MCP server over stdio. Any MCP
              client — Claude Desktop, Cursor, OpenClaw, or your own agent —
              gets instant access to Crate&apos;s full music research stack.
              No TUI, no agent loop, just raw tools.
            </p>
          </div>

          {/* Config examples */}
          <div className="grid gap-6 md:grid-cols-2 mb-16">
            {/* Claude Desktop config */}
            <div className="border border-[#222] bg-[#141414]">
              <div className="flex items-center gap-2 border-b border-[#222] px-4 py-3">
                <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
                <div className="h-3 w-3 rounded-full bg-[#28c840]" />
                <span className="ml-3 font-[family-name:var(--font-geist-mono)] text-[0.6rem] tracking-wider text-[#555]">
                  claude_desktop_config.json
                </span>
              </div>
              <div className="p-6 font-[family-name:var(--font-geist-mono)] text-sm leading-relaxed overflow-x-auto">
                <pre className="text-[#888]">{`{
  "mcpServers": {
    "crate": {
      "command": "npx",
      "args": ["-y", "crate-cli", "--mcp-server"]
    }
  }
}`}</pre>
              </div>
            </div>

            {/* OpenClaw / Cursor config */}
            <div className="border border-[#222] bg-[#141414]">
              <div className="flex items-center gap-2 border-b border-[#222] px-4 py-3">
                <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
                <div className="h-3 w-3 rounded-full bg-[#28c840]" />
                <span className="ml-3 font-[family-name:var(--font-geist-mono)] text-[0.6rem] tracking-wider text-[#555]">
                  openclaw.json / .cursor/mcp.json
                </span>
              </div>
              <div className="p-6 font-[family-name:var(--font-geist-mono)] text-sm leading-relaxed overflow-x-auto">
                <pre className="text-[#888]">{`{
  "mcpServers": {
    "crate": {
      "command": "npx",
      "args": ["-y", "crate-cli", "--mcp-server"],
      "env": {
        "ANTHROPIC_API_KEY": "\${ANTHROPIC_API_KEY}",
        "LASTFM_API_KEY": "\${LASTFM_API_KEY}",
        "GENIUS_ACCESS_TOKEN": "\${GENIUS_ACCESS_TOKEN}"
      }
    }
  }
}`}</pre>
              </div>
            </div>
          </div>

          {/* ClawHub Skill callout */}
          <div className="mb-16 border border-[#222] bg-[#0e0e0e] p-8">
            <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <p className="font-[family-name:var(--font-geist-mono)] text-[0.65rem] tracking-[0.2em] uppercase text-[#e8a849] mb-3">
                  ClawHub Skill
                </p>
                <h3 className="font-[family-name:var(--font-playfair)] text-xl mb-2">
                  Guided research workflows for OpenClaw
                </h3>
                <p className="text-sm leading-relaxed text-[#888]">
                  The MCP server gives your agent tools. The ClawHub skill teaches it
                  how to use them — structured workflows for influence tracing, track
                  verification, playlist building, and publishing. Artist research
                  patterns that cross-reference MusicBrainz, Genius, Discogs, and
                  Last.fm in the right order. Critical rules like &ldquo;never
                  hallucinate tracks&rdquo; and &ldquo;always cite the publication.&rdquo;
                </p>
              </div>
              <div className="border border-[#222] bg-[#141414] px-6 py-4 font-[family-name:var(--font-geist-mono)] text-sm whitespace-nowrap">
                <p className="text-[#555] text-[0.65rem] tracking-[0.2em] uppercase mb-2">Install</p>
                <p>
                  <span className="text-[#555]">$</span>{" "}
                  <span className="text-[#ededed]">clawhub install crate-music-research</span>
                </p>
              </div>
            </div>
          </div>

          {/* Feature tags */}
          <div className="flex flex-wrap justify-center gap-3">
            {[
              "92+ tools",
              "stdio transport",
              "zero config",
              "env-var gating",
              "any MCP client",
              "ClawHub skill",
            ].map((tag) => (
              <span
                key={tag}
                className="border border-[#222] bg-[#0e0e0e] px-4 py-2 font-[family-name:var(--font-geist-mono)] text-[0.65rem] tracking-[0.15em] uppercase text-[#888]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-6">
        <div className="divider" />
      </div>

      {/* Sources Grid */}
      <section id="sources" className="px-6 py-32">
        <div className="mx-auto max-w-6xl">
          <p className="font-[family-name:var(--font-geist-mono)] text-[0.7rem] tracking-[0.25em] uppercase text-[#888] mb-6">
            Data Sources
          </p>
          <h2 className="font-[family-name:var(--font-playfair)] text-4xl leading-[1.1] tracking-[-0.02em] sm:text-5xl mb-16">
            17 sources. 92 tools.
            <br />
            One conversation.
          </h2>

          <div className="grid grid-cols-2 gap-px border border-[#222] sm:grid-cols-3 md:grid-cols-5">
            {SOURCES.map((source) => (
              <div
                key={source.name}
                className="source-card bg-[#141414] p-6 border border-transparent"
              >
                <p className="font-[family-name:var(--font-geist-mono)] text-[0.6rem] tracking-[0.2em] uppercase text-[#555] mb-3">
                  {source.category}
                </p>
                <p className="font-[family-name:var(--font-playfair)] text-lg mb-1">
                  {source.name}
                </p>
                <p className="font-[family-name:var(--font-geist-mono)] text-xs text-[#888]">
                  {source.tools} tools
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-6">
        <div className="divider" />
      </div>

      {/* Tech Stack / How It Works */}
      <section id="stack" className="px-6 py-32">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 max-w-2xl">
            <p className="font-[family-name:var(--font-geist-mono)] text-[0.7rem] tracking-[0.25em] uppercase text-[#888] mb-6">
              How It Works
            </p>
            <h2 className="font-[family-name:var(--font-playfair)] text-4xl leading-[1.1] tracking-[-0.02em] sm:text-5xl mb-8">
              Built on the
              <br />
              Claude Agent SDK.
            </h2>
            <p className="text-lg leading-relaxed text-[#888]">
              Crate uses Anthropic&apos;s Agent SDK to orchestrate multi-turn
              research across all 17 sources. Claude decides which tools to call,
              chains results together, and reasons through complex queries — all
              in a single conversation loop.
            </p>
          </div>

          {/* Architecture diagram */}
          <div className="mb-20">
            <div className="border border-[#222] bg-[#141414] p-4 sm:p-8">
              <Image
                src="/crate-architecture.png"
                alt="Crate CLI architecture diagram showing the agent loop, MCP servers, external APIs, and local storage"
                width={1380}
                height={900}
                className="w-full h-auto"
              />
            </div>
            <p className="font-[family-name:var(--font-geist-mono)] text-[0.6rem] tracking-[0.15em] uppercase text-[#555] mt-3">
              Initial architecture diagram — some details have evolved since this was drawn.
            </p>
          </div>

          {/* Stack grid */}
          <div className="grid gap-px border border-[#222] sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                name: "Claude Agent SDK",
                role: "Agent orchestration",
                desc: "Agentic query loop with streaming, session resumption, multi-turn tool use, and cost tracking.",
              },
              {
                name: "Model Context Protocol",
                role: "Tool interface",
                desc: "Each data source is an MCP server. Tools defined with Zod schemas, called by Claude at inference time.",
              },
              {
                name: "pi-tui",
                role: "Terminal UI",
                desc: "Imperative terminal rendering with live Markdown streaming, editor input, and custom themes.",
              },
              {
                name: "Zod",
                role: "Schema validation",
                desc: "Type-safe tool definitions ensure every MCP tool has validated inputs and outputs.",
              },
              {
                name: "better-sqlite3",
                role: "Local storage",
                desc: "Collections, playlists, and the influence network cache persist locally in SQLite.",
              },
              {
                name: "Cheerio",
                role: "Web scraping",
                desc: "Parses HTML from Wikipedia, Bandcamp, and other sources for structured data extraction.",
              },
              {
                name: "Mem0",
                role: "Long-term memory",
                desc: "Optional persistent memory layer that remembers your music preferences across sessions.",
              },
              {
                name: "yt-dlp + mpv",
                role: "Audio playback",
                desc: "Streams tracks from YouTube and internet radio directly in the terminal. No browser needed.",
              },
              {
                name: "Telegraph API",
                role: "Publishing",
                desc: "Anonymous, zero-friction publishing via Telegram's Telegraph platform. No API key, no account — instant shareable pages.",
              },
              {
                name: "Tumblr API",
                role: "Blogging",
                desc: "OAuth 1.0a publishing to your Tumblr blog. Markdown-to-NPF conversion with auto-tagging and category support.",
              },
              {
                name: "TypeScript",
                role: "Language",
                desc: "End-to-end type safety from tool schemas to agent responses. Strict mode, zero any.",
              },
            ].map((tech) => (
              <div key={tech.name} className="bg-[#141414] p-8">
                <p className="font-[family-name:var(--font-geist-mono)] text-xs tracking-[0.1em] text-[#e8a849] mb-1">
                  {tech.name}
                </p>
                <p className="font-[family-name:var(--font-geist-mono)] text-[0.6rem] tracking-[0.15em] uppercase text-[#666] mb-3">
                  {tech.role}
                </p>
                <p className="text-sm leading-relaxed text-[#888]">
                  {tech.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-6">
        <div className="divider" />
      </div>

      {/* Research / Influence */}
      <section id="research" className="px-6 py-32">
        <div className="mx-auto max-w-6xl">
          {/* Header */}
          <div className="mb-16 max-w-2xl">
            <p className="font-[family-name:var(--font-geist-mono)] text-[0.7rem] tracking-[0.25em] uppercase text-[#888] mb-6">
              Academic Foundation
            </p>
            <h2 className="font-[family-name:var(--font-playfair)] text-4xl leading-[1.1] tracking-[-0.02em] sm:text-5xl mb-8">
              Influence tracing,
              <br />
              grounded in research.
            </h2>
            <p className="text-lg leading-relaxed text-[#888] mb-8">
              Crate&apos;s influence network is built on methodology from the{" "}
              <em>Harvard Data Science Review</em> — extracting artist
              connections from music criticism through co-mention analysis
              across 26 publications.
            </p>
            <div className="border border-[#222] bg-[#0e0e0e] p-6">
              <p className="font-[family-name:var(--font-geist-mono)] text-[0.65rem] tracking-[0.2em] uppercase text-[#e8a849] mb-3">
                The Paper
              </p>
              <p className="font-[family-name:var(--font-playfair)] text-xl leading-snug mb-2">
                &ldquo;Modeling Artist Influence for Music Selection and
                Recommendation: A Purely Network-Based Approach&rdquo;
              </p>
              <p className="text-sm text-[#888] mb-1">
                Elena Badillo-Goicoechea · Harvard Data Science Review, Issue 7.4, Fall 2025
              </p>
              <p className="text-sm text-[#666] mb-4">
                Proposes a recommendation system that builds a knowledge graph
                from music review text — mapping artistic influence through
                co-mentions in expert criticism rather than user behavior data.
                The approach emulates exhaustively reading through linked
                sequences of reviews, discovering new artists mentioned in each
                piece.
              </p>
              <a
                href="https://hdsr.mitpress.mit.edu/pub/t4txmd81/release/2"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 font-[family-name:var(--font-geist-mono)] text-xs tracking-[0.15em] uppercase text-[#e8a849] hover:text-[#d4963d] transition-colors"
              >
                Read the paper →
              </a>
            </div>
          </div>

          {/* Infographic */}
          <div className="mb-20 border border-[#222] bg-[#141414] p-4 sm:p-8">
            <img
              src="/influence-infographic.jpg"
              alt="Crate's Influence Network: Review-Driven Discovery — How it maps artistic influence from reviews, not just plays. Shows three features: Review-Driven Discovery (finding connections from 26 publications), Influence Tracing (building multi-hop paths between artists), and Influence Cache (local knowledge graph with BFS path-finding)."
              className="w-full rounded-sm"
            />
            <p className="mt-4 font-[family-name:var(--font-geist-mono)] text-[0.6rem] tracking-[0.2em] uppercase text-[#555] text-center">
              How Crate maps artistic influence from reviews — not streaming algorithms
            </p>
          </div>

          {/* Demo CTA */}
          <div className="mb-20 text-center">
            <a
              href="/influence-demo"
              className="inline-flex items-center gap-3 border border-[#e8a849] px-8 py-4 font-[family-name:var(--font-geist-mono)] text-xs tracking-[0.2em] uppercase text-[#e8a849] transition-all hover:bg-[#e8a849] hover:text-[#0a0a0a]"
            >
              See the interactive demo →
            </a>
            <p className="mt-3 font-[family-name:var(--font-geist-mono)] text-[0.6rem] tracking-[0.15em] uppercase text-[#555]">
              Fela Kuti → Beyoncé — four influence paths, traced and cited
            </p>
          </div>

          {/* Two-column: description + publications */}
          <div className="grid gap-20 md:grid-cols-2">
            <div>
              <p className="font-[family-name:var(--font-geist-mono)] text-[0.7rem] tracking-[0.25em] uppercase text-[#888] mb-6">
                How It Works
              </p>
              <div className="flex flex-col gap-6">
                {[
                  {
                    step: "01",
                    title: "Review-Driven Discovery",
                    desc: "Searches 26 music publications for co-mentions and influence phrases. Distinguishes casual name-drops from explicit sonic lineage signals.",
                  },
                  {
                    step: "02",
                    title: "Influence Tracing",
                    desc: "Builds multi-hop paths between artists — even distant ones. Finds bridge artists across genres using Exa neural search and Tavily keyword search.",
                  },
                  {
                    step: "03",
                    title: "Local Knowledge Graph",
                    desc: "Every discovery is cached in a local SQLite graph database. BFS path-finding gives instant results. The graph grows stronger with every query.",
                  },
                ].map((item) => (
                  <div key={item.step} className="border-l border-[#222] pl-6">
                    <p className="font-[family-name:var(--font-geist-mono)] text-[0.6rem] tracking-[0.2em] uppercase text-[#e8a849] mb-2">
                      {item.step}
                    </p>
                    <h3 className="font-[family-name:var(--font-playfair)] text-xl mb-2">
                      {item.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-[#888]">
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="font-[family-name:var(--font-geist-mono)] text-[0.7rem] tracking-[0.25em] uppercase text-[#888] mb-6">
                26 Publications Indexed
              </p>
              <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                {PUBLICATIONS.map((pub) => (
                  <p
                    key={pub}
                    className="border-b border-[#1a1a1a] py-2 font-[family-name:var(--font-geist-mono)] text-xs text-[#888]"
                  >
                    {pub}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-6">
        <div className="divider" />
      </div>

      {/* Demo placeholder */}
      <section className="px-6 py-32">
        <div className="mx-auto max-w-4xl text-center">
          <p className="font-[family-name:var(--font-geist-mono)] text-[0.7rem] tracking-[0.25em] uppercase text-[#888] mb-6">
            See it in action
          </p>
          <h2 className="font-[family-name:var(--font-playfair)] text-4xl leading-[1.1] tracking-[-0.02em] sm:text-5xl mb-12">
            Terminal-native.
            <br />
            Research-grade.
          </h2>

          {/* Terminal mockup */}
          <div className="mx-auto max-w-2xl border border-[#222] bg-[#141414]">
            <div className="flex items-center gap-2 border-b border-[#222] px-4 py-3">
              <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
              <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
              <div className="h-3 w-3 rounded-full bg-[#28c840]" />
              <span className="ml-3 font-[family-name:var(--font-geist-mono)] text-[0.6rem] tracking-wider text-[#555]">
                crate
              </span>
            </div>
            <div className="p-6 text-left font-[family-name:var(--font-geist-mono)] text-sm leading-loose">
              <p className="text-[#888]">
                <span className="text-[#e8a849]">crate &gt;</span> trace the
                influence path from Brian Eno to Aphex Twin
              </p>
              <p className="mt-4 text-[#555]">
                Searching 26 publications for co-mentions...
              </p>
              <p className="text-[#555]">
                Found direct connection via Pitchfork, The Wire
              </p>
              <p className="text-[#555]">
                Extracting neighborhood (Exa neural search)...
              </p>
              <p className="mt-4 text-[#ededed]">
                <span className="text-[#e8a849]">Brian Eno</span> →{" "}
                <span className="text-[#e8a849]">Aphex Twin</span>
              </p>
              <p className="text-[#888]">
                Confidence: 0.92 &middot; Sources: 7 reviews
              </p>
              <p className="text-[#555] mt-1">
                Shared themes: ambient, generative, texture-first
              </p>
              <p className="mt-4 text-[#888]">
                <span className="text-[#e8a849]">crate &gt;</span>{" "}
                <span className="inline-block w-2 h-4 bg-[#ededed] animate-pulse" />
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-6">
        <div className="divider" />
      </div>

      {/* Getting Started */}
      <section id="get-started" className="px-6 py-32">
        <div className="mx-auto max-w-4xl">
          <div className="text-center mb-20">
            <p className="font-[family-name:var(--font-geist-mono)] text-[0.7rem] tracking-[0.25em] uppercase text-[#888] mb-6">
              Getting Started
            </p>
            <h2 className="font-[family-name:var(--font-playfair)] text-4xl leading-[1.1] tracking-[-0.02em] sm:text-6xl mb-4">
              Start digging.
            </h2>
            <p className="mx-auto max-w-lg text-lg leading-relaxed text-[#888]">
              Open source. MIT licensed. One command to your first session.
            </p>
          </div>

          {/* Global install block */}
          <div className="mb-12">
            <div className="border border-[#e8a849]/30 bg-[#141414] p-6 text-center">
              <p className="font-[family-name:var(--font-geist-mono)] text-lg sm:text-xl tracking-wide">
                <span className="text-[#555]">$</span>{" "}
                <span className="text-[#ededed]">npm install -g crate-cli</span>
              </p>
            </div>
            <p className="text-center text-sm text-[#555] mt-3">
              Requires Node.js 20+. Then just type <span className="font-[family-name:var(--font-geist-mono)] text-[#888]">crate</span> to start. The setup wizard walks you through API keys on first run.
            </p>
          </div>

          {/* Alternative install methods */}
          <div className="mb-16 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="border border-[#222] bg-[#141414] p-5">
              <p className="font-[family-name:var(--font-geist-mono)] text-[0.65rem] tracking-[0.2em] uppercase text-[#888] mb-3">Try without installing</p>
              <p className="font-[family-name:var(--font-geist-mono)] text-sm">
                <span className="text-[#555]">$</span>{" "}
                <span className="text-[#ededed]">npx crate-cli</span>
              </p>
            </div>
            <div className="border border-[#222] bg-[#141414] p-5 overflow-x-auto">
              <p className="font-[family-name:var(--font-geist-mono)] text-[0.65rem] tracking-[0.2em] uppercase text-[#888] mb-3">Clone for development</p>
              <p className="font-[family-name:var(--font-geist-mono)] text-xs sm:text-sm whitespace-nowrap">
                <span className="text-[#555]">$</span>{" "}
                <span className="text-[#ededed]">git clone https://github.com/tmoody1973/crate-cli.git</span>
              </p>
              <p className="font-[family-name:var(--font-geist-mono)] text-xs sm:text-sm mt-1 whitespace-nowrap">
                <span className="text-[#555]">$</span>{" "}
                <span className="text-[#ededed]">cd crate-cli && npm install && npm run dev</span>
              </p>
            </div>
          </div>

          {/* API Keys */}
          <div className="mb-16">
            <div className="flex items-baseline gap-4 mb-4">
              <h3 className="font-[family-name:var(--font-playfair)] text-2xl">API Keys</h3>
              <span className="font-[family-name:var(--font-geist-mono)] text-[0.65rem] tracking-[0.2em] uppercase text-[#555]">configured in-app via setup wizard or /keys</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-[#222] border border-[#222]">
              {[
                { key: "ANTHROPIC_API_KEY", label: "Anthropic", note: "Required — powers the agent", url: "https://console.anthropic.com/", tag: "required" },
                { key: "TAVILY_API_KEY", label: "Tavily", note: "Web search for influence tracing", url: "https://tavily.com/", tag: "recommended" },
                { key: "LASTFM_API_KEY", label: "Last.fm", note: "Listening stats, similar artists", url: "https://www.last.fm/api/account/create", tag: "recommended" },
                { key: "GENIUS_ACCESS_TOKEN", label: "Genius", note: "Lyrics, annotations, artist bios", url: "https://genius.com/api-clients", tag: "recommended" },
                { key: "DISCOGS_KEY", label: "Discogs", note: "Vinyl catalog, labels, pressings", url: "https://www.discogs.com/settings/developers", tag: "optional" },
                { key: "EXA_API_KEY", label: "Exa", note: "Neural semantic search", url: "https://exa.ai/", tag: "optional" },
                { key: "YOUTUBE_API_KEY", label: "YouTube", note: "Improved search results", url: "https://console.cloud.google.com/apis", tag: "optional" },
                { key: "TUMBLR_CONSUMER_KEY", label: "Tumblr", note: "Publish research to your blog", url: "https://www.tumblr.com/oauth/apps", tag: "optional" },
                { key: "TICKETMASTER_API_KEY", label: "Ticketmaster", note: "Concert and event discovery", url: "https://developer.ticketmaster.com/", tag: "optional" },
              ].map((item) => (
                <div key={item.key} className="bg-[#0e0e0e] p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-[family-name:var(--font-geist-mono)] text-xs text-[#ededed] hover:text-[#e8a849] transition-colors"
                    >
                      {item.label} &rarr;
                    </a>
                    <span className={`font-[family-name:var(--font-geist-mono)] text-[0.6rem] tracking-wider uppercase ${
                      item.tag === "required" ? "text-[#e8a849]" : item.tag === "recommended" ? "text-[#666]" : "text-[#444]"
                    }`}>
                      {item.tag}
                    </span>
                  </div>
                  <p className="text-xs text-[#555]">{item.note}</p>
                </div>
              ))}
            </div>
            <p className="text-sm text-[#555] mt-3">
              Only Anthropic is required. The setup wizard prompts you for keys on first run.
              Add or change keys anytime with{" "}
              <span className="font-[family-name:var(--font-geist-mono)] text-[#888]">/keys</span>.
              For audio playback, install{" "}
              <a href="https://mpv.io" target="_blank" rel="noopener noreferrer" className="text-[#888] hover:text-[#ededed] transition-colors underline underline-offset-2">mpv</a>
              {" "}and{" "}
              <a href="https://github.com/yt-dlp/yt-dlp" target="_blank" rel="noopener noreferrer" className="text-[#888] hover:text-[#ededed] transition-colors underline underline-offset-2">yt-dlp</a>.
            </p>
          </div>

          {/* Try these prompts */}
          <div className="mb-20">
            <h3 className="font-[family-name:var(--font-playfair)] text-xl mb-6">Things to try</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                "What are the rarest vinyl pressings of MF DOOM albums?",
                "Trace the influence path from Fela Kuti to Beyoncé",
                "Play something that sounds like Boards of Canada",
                "Find me a jazz radio station from Japan",
                "Who played on every track of Blonde by Frank Ocean?",
                "Build a playlist of ambient albums from the last 5 years",
                "Set up my Crate page and post my latest influence chain",
              ].map((prompt) => (
                <div
                  key={prompt}
                  className="border border-[#222] bg-[#141414] px-4 py-3 font-[family-name:var(--font-geist-mono)] text-xs text-[#888] leading-relaxed"
                >
                  <span className="text-[#e8a849]">crate &gt;</span> {prompt}
                </div>
              ))}
            </div>
          </div>

          {/* CTA buttons */}
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <a
              href="https://github.com/tmoody1973/crate-cli"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 border border-[#ededed] bg-[#ededed] px-8 py-4 font-[family-name:var(--font-geist-mono)] text-xs tracking-[0.15em] uppercase text-[#0a0a0a] transition-all hover:bg-transparent hover:text-[#ededed]"
            >
              View on GitHub
            </a>
            <a
              href="https://github.com/tmoody1973/crate-cli#quick-start"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 border border-[#222] px-8 py-4 font-[family-name:var(--font-geist-mono)] text-xs tracking-[0.15em] uppercase text-[#888] transition-all hover:border-[#ededed] hover:text-[#ededed]"
            >
              Read the Docs
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#222] px-6 py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <p className="font-[family-name:var(--font-geist-mono)] text-[0.6rem] tracking-[0.2em] uppercase text-[#555]">
            Crate CLI &middot; MIT License
          </p>
          <p className="font-[family-name:var(--font-geist-mono)] text-[0.6rem] tracking-[0.15em] text-[#555]">
            Made with <span className="text-red-500">♥</span> by{" "}
            <a
              href="https://tarikmoody.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#888] transition-colors hover:text-[#ededed]"
            >
              Tarik Moody
            </a>
          </p>
          <div className="flex gap-8">
            <a
              href="https://github.com/tmoody1973/crate-cli"
              target="_blank"
              rel="noopener noreferrer"
              className="font-[family-name:var(--font-geist-mono)] text-[0.6rem] tracking-[0.2em] uppercase text-[#555] transition-colors hover:text-[#ededed]"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
