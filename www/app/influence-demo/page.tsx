"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useCallback } from "react";

/* ── Artist portrait photos (Wikimedia Commons, CC-licensed) ───────── */

const ARTIST_PHOTOS: Record<string, string> = {
  "Fela Kuti":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Fela_Kuti_circa_1986.jpg/200px-Fela_Kuti_circa_1986.jpg",
  "Beyoncé":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Beyonce_Smile.JPG/200px-Beyonce_Smile.JPG",
  "Erykah Badu":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/Erykah_Badu_%283746286025%29.jpg/200px-Erykah_Badu_%283746286025%29.jpg",
  "James Brown":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/James-Brown_1973.jpg/200px-James-Brown_1973.jpg",
  "Missy Elliott":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/92/Missy_Elliott_2006.jpg/200px-Missy_Elliott_2006.jpg",
  "Burna Boy":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/Burna_Boy_%28cropped%29.jpg/200px-Burna_Boy_%28cropped%29.jpg",
};

/* ── Influence path data ─────────────────────────────────────────────── */

const PATHS = [
  {
    id: "direct",
    label: "Direct",
    hops: "1 hop",
    strength: 0.8,
    color: "#e8a849",
    route: "Fela Kuti → Beyoncé",
    nodes: [
      {
        artist: "Fela Kuti",
        years: "1938 – 1997",
        role: "Afrobeat Pioneer",
        album: "Zombie",
        albumYear: "1977",
        era: "1970s",
        cover:
          "https://i.discogs.com/ItpKNW1H_VDfqdz5TTozy1cvPjKlp7NrfAVCg6MExnM/rs:fit/g:sm/q:90/h:600/w:600/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTE2Njky/MDQtMTIyMTMxMDk4/OS5qcGVn.jpeg",
      },
      {
        artist: "Beyoncé",
        years: "b. 1981",
        role: "Contemporary Icon",
        album: "4",
        albumYear: "2011",
        era: "2010s",
        cover:
          "https://i.discogs.com/HcA3t5n0Hp_5VaQr4yyiIiTQmrgIJIgjKlz_tNS1mz8/rs:fit/g:sm/q:90/h:500/w:500/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTMwNTk0/NDAtMTMxMzkwNjE5/Mi5qcGVn.jpeg",
      },
    ],
    evidence:
      'Producer The Dream revealed Beyoncé recorded a 20-track album inspired by Fela Kuti prior to her album "4" (2011). The track "End of Time" directly channels Fela\'s Afrobeat bass line aesthetic.',
    sources: ["The Guardian", "Pitchfork", "NPR"],
  },
  {
    id: "neosoul",
    label: "Neo-Soul Bridge",
    hops: "2 hops",
    strength: 0.83,
    color: "#a78bfa",
    route: "Fela Kuti → Erykah Badu → Beyoncé",
    nodes: [
      {
        artist: "Fela Kuti",
        years: "1938 – 1997",
        role: "Afrobeat Pioneer",
        album: "Expensive Shit",
        albumYear: "1975",
        era: "1970s",
        cover:
          "https://i.discogs.com/xAb3PnJRj4DxYVy3H2bAfF_2YB06P6MvLhHiCqG8jbw/rs:fit/g:sm/q:90/h:597/w:600/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTEyMDk0/MjMtMTQ0NjkxMTIw/OC04MTcxLmpwZWc.jpeg",
      },
      {
        artist: "Erykah Badu",
        years: "b. 1971",
        role: "Neo-Soul Pioneer",
        album: "Baduizm",
        albumYear: "1997",
        era: "1990s",
        cover:
          "https://i.discogs.com/EfuVkJxS3lPdJiPoU26DumEY9OLfkMRv2qfJlRhRjgs/rs:fit/g:sm/q:90/h:596/w:600/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTE4NTc0/ODAtMTQ2NjkwNzAy/My05MzIxLnBuZw.jpeg",
      },
      {
        artist: "Beyoncé",
        years: "b. 1981",
        role: "Contemporary Icon",
        album: "Lemonade",
        albumYear: "2016",
        era: "2010s",
        cover:
          "https://i.discogs.com/d_NHOdW08PWv6M_xqfvIBn5G3iq9wFUBjElKsK0VBmE/rs:fit/g:sm/q:90/h:600/w:600/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTg0NTkx/MTUtMTQ2MjQ1MDIx/MC0xODIwLmpwZWc.jpeg",
      },
    ],
    evidence:
      "Erykah Badu curated Fela Kuti Box Set #4 (2017), positioning herself as his spiritual heir — walking in the roles of \"shaman, emcee, and raconteur\" that defined Fela's live performances. Beyoncé absorbed this reverence for Black cultural tradition.",
    sources: ["The Wire", "Pitchfork", "Aquarium Drunkard"],
  },
  {
    id: "funk",
    label: "Funk Lineage",
    hops: "3 hops",
    strength: 0.85,
    color: "#34d399",
    route: "Fela Kuti → James Brown → Missy Elliott → Beyoncé",
    nodes: [
      {
        artist: "Fela Kuti",
        years: "1938 – 1997",
        role: "Afrobeat Pioneer",
        album: "Gentleman",
        albumYear: "1973",
        era: "1970s",
        cover:
          "https://i.discogs.com/HRuqkwjDnhSRZEKSxfQWHrOTmqiLAUKgJAFBNvmCdpg/rs:fit/g:sm/q:90/h:596/w:600/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTMzMTQ3/MzktMTMyNjI5MTM1/OC5qcGVn.jpeg",
      },
      {
        artist: "James Brown",
        years: "1933 – 2006",
        role: "Godfather of Soul",
        album: "The Payback",
        albumYear: "1973",
        era: "1970s",
        cover:
          "https://i.discogs.com/ZC7RSa9C44-T_EEHb9WjBMUUJFzjWZPJfDJD3oZt4t0/rs:fit/g:sm/q:90/h:594/w:600/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTU2MjU0/Mi0xMjIzMTUyNjc0/LmpwZWc.jpeg",
      },
      {
        artist: "Missy Elliott",
        years: "b. 1971",
        role: "Hip-Hop Innovator",
        album: "Under Construction",
        albumYear: "2002",
        era: "2000s",
        cover:
          "https://i.discogs.com/B_WyW8_4_X3bPmj5vJqDQYNS_NjqpBvJbqZvjEJr1W4/rs:fit/g:sm/q:90/h:587/w:600/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTk3NDgy/NTctMTQ4NTk4MTg4/MC0zNjY1LmpwZWc.jpeg",
      },
      {
        artist: "Beyoncé",
        years: "b. 1981",
        role: "Contemporary Icon",
        album: "Renaissance",
        albumYear: "2022",
        era: "2020s",
        cover:
          "https://i.discogs.com/UxOr0yfEYbGLfFxF4hn3yd3j-EQZZGnRcI-GqKz7zVE/rs:fit/g:sm/q:90/h:600/w:600/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTI0MDcy/NzU3LTE2NjI3MDk2/ODQtMTczNi5qcGVn.jpeg",
      },
    ],
    evidence:
      "Fela studied James Brown's band in LA in 1969, absorbing funk methodology and Black Panther consciousness. Brown's rhythmic blueprint flowed through hip-hop/R&B innovators like Missy Elliott into Beyoncé's work with Timbaland and Darkchild.",
    sources: ["NPR", "The Guardian", "AllMusic", "The FADER"],
  },
  {
    id: "genre",
    label: "Genre Bridge",
    hops: "Genre-level",
    strength: 0.82,
    color: "#f472b6",
    route: "Afrobeat (genre) → Contemporary Afrobeats → Beyoncé",
    nodes: [
      {
        artist: "Fela Kuti",
        years: "1938 – 1997",
        role: "Created Afrobeat",
        album: "Roforofo Fight",
        albumYear: "1972",
        era: "1970s",
        cover:
          "https://i.discogs.com/C85MlIjkUXQHjdkfxjpVjpEBVIUaEQFPbnpTGqxkijY/rs:fit/g:sm/q:90/h:600/w:600/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTIwODI3/NTktMTQ0MTMwNjAz/OS01OTIwLmpwZWc.jpeg",
      },
      {
        artist: "Burna Boy",
        years: "b. 1991",
        role: "Afrobeats Global Star",
        album: "African Giant",
        albumYear: "2019",
        era: "2010s",
        cover:
          "https://i.discogs.com/S3n2h7W6kxNX2XijCYWMPyXmv_E8HSwHKJqeLqI6s6s/rs:fit/g:sm/q:90/h:600/w:600/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTE0MDg3/NjUyLTE1NjkzMTUy/NDAtNTIxMS5qcGVn.jpeg",
      },
      {
        artist: "Beyoncé",
        years: "b. 1981",
        role: "Contemporary Icon",
        album: "The Lion King: The Gift",
        albumYear: "2019",
        era: "2010s",
        cover:
          "https://i.discogs.com/x3LOLNVpmxTF2FNQPVLOcRfQcnJjpgXNp8JdWChb2u8/rs:fit/g:sm/q:90/h:600/w:600/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9SLTE0MDQ1/MjgwLTE1Njg1MDky/NTAtNjA2MC5qcGVn.jpeg",
      },
    ],
    evidence:
      "Beyoncé explicitly recruited Afrobeats artists for her projects — Wizkid, Burna Boy, Tekno, Yemi Alade, Mr Eazi, Tiwa Savage. Her albums celebrate the lineage of Black music-making across continents, connecting Fela's original Afrobeat to contemporary global pop.",
    sources: ["Bandcamp Daily", "Pitchfork", "The FADER", "Stereogum"],
  },
];

const COMPARISON = [
  {
    element: "Politics",
    fela: "Resisted Nigerian military dictatorship",
    beyonce:
      "Black Is King, Lemonade, Cowboy Carter — reclaiming Black power",
  },
  {
    element: "Spirituality",
    fela: "Shaman/spiritual leader; Afrokan spirituality",
    beyonce: "HBCU traditions, marching bands, sacred Black spaces",
  },
  {
    element: "Rhythm",
    fela: '"Polyrhythmic grooves; groove as liberation"',
    beyonce: "Clubs, ball houses; dance as freedom",
  },
  {
    element: "Collaboration",
    fela: "African collective (Africa 70)",
    beyonce: "Black diaspora (Afrobeats artists, global collaborators)",
  },
  {
    element: "Message",
    fela: '"Music is the weapon"',
    beyonce: "Music as celebration of Black identity and autonomy",
  },
];

/* ── Image with error fallback ─────────────────────────────────────── */

function AlbumCover({
  src,
  alt,
  size = 120,
}: {
  src: string;
  alt: string;
  size?: number;
}) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div
        className="flex items-center justify-center bg-[#1a1a1a] text-[#333]"
        style={{ width: size, height: size }}
      >
        <svg width={size * 0.4} height={size * 0.4} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      className="object-cover"
      sizes={`${size}px`}
      loading="lazy"
      unoptimized
      onError={() => setError(true)}
    />
  );
}

/* ── Circular artist portrait ──────────────────────────────────────── */

function ArtistPhoto({
  artist,
  size = 48,
}: {
  artist: string;
  size?: number;
}) {
  const [error, setError] = useState(false);
  const src = ARTIST_PHOTOS[artist];

  if (!src || error) {
    return (
      <div
        className="rounded-full bg-[#1a1a1a] border border-[#333] flex items-center justify-center text-[#555] shrink-0"
        style={{ width: size, height: size }}
      >
        <svg width={size * 0.45} height={size * 0.45} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="8" r="4" />
          <path d="M5.5 21c0-3.87 2.91-7 6.5-7s6.5 3.13 6.5 7" />
        </svg>
      </div>
    );
  }

  return (
    <div
      className="relative rounded-full overflow-hidden border border-[#333] shrink-0"
      style={{ width: size, height: size }}
    >
      <Image
        src={src}
        alt={artist}
        fill
        className="object-cover"
        sizes={`${size}px`}
        loading="lazy"
        unoptimized
        onError={() => setError(true)}
      />
    </div>
  );
}

/* ── Animated SVG connector ────────────────────────────────────────── */

function AnimatedConnector({
  color,
  direction = "horizontal",
}: {
  color: string;
  direction?: "horizontal" | "vertical";
}) {
  const isH = direction === "horizontal";
  const w = isH ? 80 : 12;
  const h = isH ? 32 : 48;

  return (
    <div className={`flex items-center justify-center shrink-0 ${isH ? "mx-1 sm:mx-2" : "my-1"}`}>
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        fill="none"
        className="overflow-visible"
      >
        {/* Glow filter */}
        <defs>
          <filter id={`glow-${color.replace("#", "")}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Animated gradient */}
          <linearGradient
            id={`flow-${color.replace("#", "")}-${direction}`}
            gradientUnits="userSpaceOnUse"
            x1={isH ? "0" : "6"}
            y1={isH ? "16" : "0"}
            x2={isH ? String(w) : "6"}
            y2={isH ? "16" : String(h)}
          >
            <stop offset="0%" stopColor={color} stopOpacity="0.1">
              <animate attributeName="stop-opacity" values="0.1;0.6;0.1" dur="2s" repeatCount="indefinite" />
            </stop>
            <stop offset="50%" stopColor={color} stopOpacity="0.8">
              <animate attributeName="stop-opacity" values="0.8;1;0.8" dur="2s" repeatCount="indefinite" />
            </stop>
            <stop offset="100%" stopColor={color} stopOpacity="0.1">
              <animate attributeName="stop-opacity" values="0.1;0.6;0.1" dur="2s" repeatCount="indefinite" />
            </stop>
          </linearGradient>
        </defs>

        {/* Background line */}
        {isH ? (
          <line x1="0" y1="16" x2={w} y2="16" stroke={color} strokeOpacity="0.15" strokeWidth="2" />
        ) : (
          <line x1="6" y1="0" x2="6" y2={h} stroke={color} strokeOpacity="0.15" strokeWidth="2" />
        )}

        {/* Animated flowing line */}
        {isH ? (
          <line
            x1="0"
            y1="16"
            x2={w}
            y2="16"
            stroke={`url(#flow-${color.replace("#", "")}-${direction})`}
            strokeWidth="2"
            filter={`url(#glow-${color.replace("#", "")})`}
          />
        ) : (
          <line
            x1="6"
            y1="0"
            x2="6"
            y2={h}
            stroke={`url(#flow-${color.replace("#", "")}-${direction})`}
            strokeWidth="2"
            filter={`url(#glow-${color.replace("#", "")})`}
          />
        )}

        {/* Flowing particle */}
        {isH ? (
          <circle r="3" fill={color} opacity="0.9" filter={`url(#glow-${color.replace("#", "")})`}>
            <animateMotion dur="1.5s" repeatCount="indefinite" path={`M0,16 L${w},16`} />
            <animate attributeName="opacity" values="0;0.9;0" dur="1.5s" repeatCount="indefinite" />
          </circle>
        ) : (
          <circle r="3" fill={color} opacity="0.9" filter={`url(#glow-${color.replace("#", "")})`}>
            <animateMotion dur="1.5s" repeatCount="indefinite" path={`M6,0 L6,${h}`} />
            <animate attributeName="opacity" values="0;0.9;0" dur="1.5s" repeatCount="indefinite" />
          </circle>
        )}

        {/* Arrow head */}
        {isH ? (
          <polygon
            points={`${w - 8},11 ${w},16 ${w - 8},21`}
            fill={color}
            opacity="0.7"
          >
            <animate attributeName="opacity" values="0.4;0.9;0.4" dur="2s" repeatCount="indefinite" />
          </polygon>
        ) : (
          <polygon
            points={`1,${h - 8} 6,${h} 11,${h - 8}`}
            fill={color}
            opacity="0.7"
          >
            <animate attributeName="opacity" values="0.4;0.9;0.4" dur="2s" repeatCount="indefinite" />
          </polygon>
        )}
      </svg>
    </div>
  );
}

/* ── Artist node card (Grid view) ──────────────────────────────────── */

function ArtistNode({
  artist,
  years,
  role,
  album,
  albumYear,
  cover,
  isFirst,
  isLast,
  color,
  isHighlighted,
  onHover,
  onLeave,
}: {
  artist: string;
  years: string;
  role: string;
  album: string;
  albumYear: string;
  cover: string;
  isFirst: boolean;
  isLast: boolean;
  color: string;
  isHighlighted: boolean;
  onHover: () => void;
  onLeave: () => void;
}) {
  const borderStyle = isFirst || isLast ? color : "#333";
  const opacity = isHighlighted ? 1 : 0.4;

  return (
    <div
      className="relative flex flex-col items-center w-[140px] sm:w-[160px] shrink-0 transition-all duration-300 cursor-pointer group"
      style={{ opacity }}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      {/* Artist portrait */}
      <div className="mb-2 transition-all duration-300 group-hover:scale-105">
        <ArtistPhoto artist={artist} size={52} />
      </div>

      {/* Album art */}
      <div
        className="relative w-[100px] h-[100px] sm:w-[120px] sm:h-[120px] rounded-sm overflow-hidden mb-3 ring-1 transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg"
        style={{
          boxShadow: `0 0 20px ${color}22`,
          // @ts-expect-error ring color via CSS var
          "--tw-ring-color": borderStyle,
        }}
      >
        <AlbumCover src={cover} alt={`${album} by ${artist}`} />
      </div>

      {/* Artist name */}
      <p
        className="font-[family-name:var(--font-playfair)] text-sm sm:text-base text-center leading-tight transition-colors duration-300"
        style={isFirst || isLast ? { color } : undefined}
      >
        {artist}
      </p>
      <p className="font-[family-name:var(--font-geist-mono)] text-[0.55rem] tracking-[0.15em] uppercase text-[#666] mt-0.5">
        {role}
      </p>
      <p className="font-[family-name:var(--font-geist-mono)] text-[0.5rem] text-[#555] mt-1">
        {album} ({albumYear})
      </p>
      <p className="font-[family-name:var(--font-geist-mono)] text-[0.5rem] text-[#444]">
        {years}
      </p>

      {/* Hover tooltip */}
      <div className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
        <div className="bg-[#1a1a1a] border border-[#333] px-3 py-2 rounded-sm whitespace-nowrap">
          <p className="font-[family-name:var(--font-geist-mono)] text-[0.55rem] text-[#888]">
            {role} · {albumYear}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Timeline node (horizontal timeline view) ──────────────────────── */

function TimelineNode({
  artist,
  role,
  album,
  albumYear,
  era,
  cover,
  isFirst,
  isLast,
  color,
  index,
  total,
}: {
  artist: string;
  role: string;
  album: string;
  albumYear: string;
  era: string;
  cover: string;
  isFirst: boolean;
  isLast: boolean;
  color: string;
  index: number;
  total: number;
}) {
  const isTop = index % 2 === 0;

  return (
    <div
      className="relative flex flex-col items-center"
      style={{ flex: 1, minWidth: 140 }}
    >
      {/* Content card — alternates above/below timeline */}
      <div
        className={`flex flex-col items-center transition-all duration-300 ${
          isTop ? "order-1 mb-4" : "order-3 mt-4"
        }`}
      >
        {/* Artist portrait */}
        <div className="mb-1">
          <ArtistPhoto artist={artist} size={40} />
        </div>

        {/* Album art */}
        <div
          className="relative w-[80px] h-[80px] sm:w-[100px] sm:h-[100px] rounded-sm overflow-hidden mb-2 ring-1 hover:scale-110 transition-transform duration-300"
          style={{
            boxShadow: `0 0 16px ${color}22`,
            // @ts-expect-error ring color
            "--tw-ring-color": isFirst || isLast ? color : "#333",
          }}
        >
          <AlbumCover src={cover} alt={`${album} by ${artist}`} size={100} />
        </div>
        <p
          className="font-[family-name:var(--font-playfair)] text-xs sm:text-sm text-center leading-tight"
          style={isFirst || isLast ? { color } : undefined}
        >
          {artist}
        </p>
        <p className="font-[family-name:var(--font-geist-mono)] text-[0.5rem] tracking-[0.1em] uppercase text-[#555] mt-0.5">
          {role}
        </p>
      </div>

      {/* Timeline dot + year */}
      <div className="order-2 flex flex-col items-center z-10">
        <div
          className="w-4 h-4 rounded-full border-2 transition-all duration-300"
          style={{
            borderColor: color,
            backgroundColor: isFirst || isLast ? color : "transparent",
            boxShadow: `0 0 12px ${color}44`,
          }}
        />
        <p
          className="font-[family-name:var(--font-geist-mono)] text-[0.55rem] tracking-[0.1em] mt-1"
          style={{ color }}
        >
          {albumYear}
        </p>
        <p className="font-[family-name:var(--font-geist-mono)] text-[0.45rem] tracking-[0.15em] uppercase text-[#444]">
          {era}
        </p>
      </div>

      {/* Connecting line segment */}
      {index < total - 1 && (
        <div
          className="absolute top-1/2 right-0 h-[2px] translate-x-1/2 z-0"
          style={{
            width: "100%",
            background: `linear-gradient(90deg, ${color}66, ${color}22)`,
          }}
        />
      )}
    </div>
  );
}

/* ── View mode toggle ──────────────────────────────────────────────── */

function ViewToggle({
  mode,
  setMode,
}: {
  mode: "grid" | "timeline";
  setMode: (m: "grid" | "timeline") => void;
}) {
  return (
    <div className="flex items-center gap-1 bg-[#111] border border-[#222] rounded-sm p-0.5">
      <button
        onClick={() => setMode("grid")}
        className={`font-[family-name:var(--font-geist-mono)] text-[0.55rem] tracking-[0.15em] uppercase px-3 py-1.5 rounded-sm transition-all ${
          mode === "grid"
            ? "bg-[#1a1a1a] text-[#ededed]"
            : "text-[#555] hover:text-[#888]"
        }`}
      >
        Grid
      </button>
      <button
        onClick={() => setMode("timeline")}
        className={`font-[family-name:var(--font-geist-mono)] text-[0.55rem] tracking-[0.15em] uppercase px-3 py-1.5 rounded-sm transition-all ${
          mode === "timeline"
            ? "bg-[#1a1a1a] text-[#ededed]"
            : "text-[#555] hover:text-[#888]"
        }`}
      >
        Timeline
      </button>
    </div>
  );
}

/* ── Page component ──────────────────────────────────────────────────── */

export default function InfluenceDemo() {
  const [activePath, setActivePath] = useState("direct");
  const [viewMode, setViewMode] = useState<"grid" | "timeline">("grid");
  const [hoveredNode, setHoveredNode] = useState<number | null>(null);
  const currentPath = PATHS.find((p) => p.id === activePath) ?? PATHS[0];

  const isNodeHighlighted = useCallback(
    (index: number) => hoveredNode === null || hoveredNode === index,
    [hoveredNode]
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      {/* SVG filter defs (global, rendered once) */}
      <svg width="0" height="0" className="absolute">
        <defs>
          <filter id="glow-global" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>

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
        <div className="mx-auto max-w-5xl">
          <p className="font-[family-name:var(--font-geist-mono)] text-[0.7rem] tracking-[0.25em] uppercase text-[#888] mb-4">
            Influence Tracing Demo
          </p>
          <h1 className="font-[family-name:var(--font-playfair)] text-4xl leading-[1.1] tracking-[-0.02em] sm:text-5xl md:text-6xl mb-6">
            Fela Kuti → Beyoncé
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-[#888] mb-4">
            How Crate traces artistic influence across continents, decades, and
            genres — using co-mentions from 26 music publications instead of
            listening data.
          </p>
          <p className="max-w-2xl text-sm leading-relaxed text-[#555]">
            This is a real output from Crate&apos;s influence tracing engine.
            Every connection is sourced from music criticism, not algorithms.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-6">
        <div className="divider" />
      </div>

      {/* Terminal prompt */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <div className="bg-[#111] border border-[#222] rounded-sm p-6 sm:p-8">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-3 h-3 rounded-full bg-[#ff5f56]" />
              <span className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
              <span className="w-3 h-3 rounded-full bg-[#27c93f]" />
              <span className="ml-4 font-[family-name:var(--font-geist-mono)] text-[0.65rem] text-[#555]">
                crate
              </span>
            </div>
            <p className="font-[family-name:var(--font-geist-mono)] text-sm text-[#888]">
              <span className="text-[#e8a849]">$</span>{" "}
              <span className="text-[#ededed]">
                Trace the influence path from Fela Kuti to Beyoncé
              </span>
            </p>
            <p className="font-[family-name:var(--font-geist-mono)] text-xs text-[#555] mt-3">
              Searching 26 publications for co-mentions... Found 4 paths with
              cited evidence.
            </p>
          </div>
        </div>
      </section>

      {/* Path selector tabs + view toggle */}
      <section className="px-6 pb-8">
        <div className="mx-auto max-w-5xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {PATHS.map((path) => (
              <button
                key={path.id}
                onClick={() => setActivePath(path.id)}
                className="font-[family-name:var(--font-geist-mono)] text-[0.65rem] tracking-[0.1em] uppercase px-4 py-2 border transition-all duration-300"
                style={{
                  borderColor:
                    activePath === path.id ? path.color : "#333",
                  color:
                    activePath === path.id ? path.color : "#666",
                  backgroundColor:
                    activePath === path.id ? `${path.color}08` : "transparent",
                  boxShadow:
                    activePath === path.id ? `0 0 16px ${path.color}11` : "none",
                }}
              >
                {path.label}
                <span className="ml-2 text-[0.55rem] opacity-60">
                  {path.hops}
                </span>
              </button>
            ))}
          </div>
          <ViewToggle mode={viewMode} setMode={setViewMode} />
        </div>
      </section>

      {/* Active path visualization */}
      <section className="px-6 pb-20">
        <div className="mx-auto max-w-5xl">
          <div className="bg-[#0e0e0e] border border-[#1a1a1a] rounded-sm p-6 sm:p-10 transition-all duration-500">
            {/* Path header */}
            <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
              <div>
                <p
                  className="font-[family-name:var(--font-geist-mono)] text-[0.65rem] tracking-[0.15em] uppercase mb-1"
                  style={{ color: currentPath.color }}
                >
                  {currentPath.label} Path
                </p>
                <p className="font-[family-name:var(--font-geist-mono)] text-xs text-[#555]">
                  {currentPath.route}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="font-[family-name:var(--font-geist-mono)] text-[0.55rem] tracking-[0.15em] uppercase text-[#555]">
                    Strength
                  </p>
                  <p
                    className="font-[family-name:var(--font-playfair)] text-2xl"
                    style={{ color: currentPath.color }}
                  >
                    {currentPath.strength.toFixed(2)}
                  </p>
                </div>
                {/* Strength bar */}
                <div className="w-24 h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: `${currentPath.strength * 100}%`,
                      backgroundColor: currentPath.color,
                      boxShadow: `0 0 8px ${currentPath.color}66`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* ── Grid view (animated connectors) ── */}
            <div
              className={`transition-all duration-500 ${
                viewMode === "grid"
                  ? "opacity-100 max-h-[600px]"
                  : "opacity-0 max-h-0 overflow-hidden"
              }`}
            >
              <div className="flex items-center justify-center py-8 overflow-x-auto">
                <div className="flex items-center">
                  {currentPath.nodes.map((node, i) => (
                    <div key={node.artist + i} className="flex items-center">
                      <ArtistNode
                        {...node}
                        isFirst={i === 0}
                        isLast={i === currentPath.nodes.length - 1}
                        color={currentPath.color}
                        isHighlighted={isNodeHighlighted(i)}
                        onHover={() => setHoveredNode(i)}
                        onLeave={() => setHoveredNode(null)}
                      />
                      {i < currentPath.nodes.length - 1 && (
                        <AnimatedConnector
                          color={currentPath.color}
                          direction="horizontal"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Timeline view ── */}
            <div
              className={`transition-all duration-500 ${
                viewMode === "timeline"
                  ? "opacity-100 max-h-[600px]"
                  : "opacity-0 max-h-0 overflow-hidden"
              }`}
            >
              <div className="relative py-12 overflow-x-auto">
                {/* Timeline base line */}
                <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] z-0">
                  <div
                    className="w-full h-full"
                    style={{
                      background: `linear-gradient(90deg, transparent 0%, ${currentPath.color}33 10%, ${currentPath.color}33 90%, transparent 100%)`,
                    }}
                  />
                  {/* Animated pulse on timeline */}
                  <div
                    className="absolute top-0 h-full w-1/3"
                    style={{
                      background: `linear-gradient(90deg, transparent, ${currentPath.color}66, transparent)`,
                      animation: "slideRight 3s ease-in-out infinite",
                    }}
                  />
                </div>

                {/* Timeline nodes */}
                <div className="relative flex items-center justify-between z-10 min-w-[500px]">
                  {currentPath.nodes.map((node, i) => (
                    <TimelineNode
                      key={node.artist + i}
                      {...node}
                      isFirst={i === 0}
                      isLast={i === currentPath.nodes.length - 1}
                      color={currentPath.color}
                      index={i}
                      total={currentPath.nodes.length}
                    />
                  ))}
                </div>

                {/* Era labels */}
                <div className="flex justify-between mt-6 px-8">
                  <span className="font-[family-name:var(--font-geist-mono)] text-[0.5rem] tracking-[0.2em] uppercase text-[#333]">
                    Origin
                  </span>
                  <span className="font-[family-name:var(--font-geist-mono)] text-[0.5rem] tracking-[0.2em] uppercase text-[#333]">
                    Present
                  </span>
                </div>
              </div>
            </div>

            {/* Evidence */}
            <div className="mt-8 pt-6 border-t border-[#1a1a1a]">
              <p className="font-[family-name:var(--font-geist-mono)] text-[0.6rem] tracking-[0.2em] uppercase text-[#555] mb-3">
                Cited Evidence
              </p>
              <p className="text-sm leading-relaxed text-[#999] max-w-3xl">
                {currentPath.evidence}
              </p>
              <div className="flex flex-wrap gap-2 mt-4">
                {currentPath.sources.map((src) => (
                  <span
                    key={src}
                    className="font-[family-name:var(--font-geist-mono)] text-[0.55rem] tracking-[0.1em] uppercase px-2 py-1 border border-[#222] text-[#555] hover:border-[#444] hover:text-[#888] transition-colors cursor-default"
                  >
                    {src}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-6">
        <div className="divider" />
      </div>

      {/* All paths table */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <p className="font-[family-name:var(--font-geist-mono)] text-[0.7rem] tracking-[0.25em] uppercase text-[#888] mb-6">
            All Paths Discovered
          </p>
          <h2 className="font-[family-name:var(--font-playfair)] text-3xl leading-[1.1] tracking-[-0.02em] sm:text-4xl mb-12">
            Four routes across
            <br />
            continents and decades.
          </h2>

          <div className="grid gap-px border border-[#222]">
            {/* Header */}
            <div className="hidden sm:grid grid-cols-[1fr_100px_100px_2fr] bg-[#111] px-6 py-3">
              {["Path", "Hops", "Strength", "Route"].map((h) => (
                <p
                  key={h}
                  className="font-[family-name:var(--font-geist-mono)] text-[0.55rem] tracking-[0.2em] uppercase text-[#555]"
                >
                  {h}
                </p>
              ))}
            </div>
            {/* Rows */}
            {PATHS.map((path) => (
              <button
                key={path.id}
                onClick={() => {
                  setActivePath(path.id);
                  window.scrollTo({ top: 400, behavior: "smooth" });
                }}
                className={`grid sm:grid-cols-[1fr_100px_100px_2fr] gap-2 px-6 py-5 text-left transition-all duration-300 border-t border-[#1a1a1a] first:border-t-0 ${
                  activePath === path.id
                    ? "bg-[#141414]"
                    : "bg-[#0e0e0e] hover:bg-[#131313]"
                }`}
              >
                <p
                  className="font-[family-name:var(--font-playfair)] text-base"
                  style={{ color: path.color }}
                >
                  {path.label}
                </p>
                <p className="font-[family-name:var(--font-geist-mono)] text-xs text-[#666]">
                  {path.hops}
                </p>
                <div className="flex items-center gap-2">
                  <div className="w-12 h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${path.strength * 100}%`,
                        backgroundColor: path.color,
                      }}
                    />
                  </div>
                  <p
                    className="font-[family-name:var(--font-geist-mono)] text-xs"
                    style={{ color: path.color }}
                  >
                    {path.strength.toFixed(2)}
                  </p>
                </div>
                <p className="font-[family-name:var(--font-geist-mono)] text-xs text-[#666]">
                  {path.route}
                </p>
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-6">
        <div className="divider" />
      </div>

      {/* Common thread comparison */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <p className="font-[family-name:var(--font-geist-mono)] text-[0.7rem] tracking-[0.25em] uppercase text-[#888] mb-6">
            The Common Thread
          </p>
          <h2 className="font-[family-name:var(--font-playfair)] text-3xl leading-[1.1] tracking-[-0.02em] sm:text-4xl mb-12">
            Political, spiritual,
            <br />
            Black music.
          </h2>

          <div className="grid gap-px border border-[#222]">
            {/* Header */}
            <div className="grid grid-cols-[120px_1fr_1fr] bg-[#111] px-6 py-3">
              <p className="font-[family-name:var(--font-geist-mono)] text-[0.55rem] tracking-[0.2em] uppercase text-[#555]">
                Element
              </p>
              <p className="font-[family-name:var(--font-geist-mono)] text-[0.55rem] tracking-[0.2em] uppercase text-[#e8a849]">
                Fela Kuti
              </p>
              <p className="font-[family-name:var(--font-geist-mono)] text-[0.55rem] tracking-[0.2em] uppercase text-[#a78bfa]">
                Beyoncé
              </p>
            </div>
            {/* Rows */}
            {COMPARISON.map((row) => (
              <div
                key={row.element}
                className="grid grid-cols-[120px_1fr_1fr] bg-[#0e0e0e] px-6 py-5 border-t border-[#1a1a1a] hover:bg-[#111] transition-colors"
              >
                <p className="font-[family-name:var(--font-geist-mono)] text-xs text-[#888]">
                  {row.element}
                </p>
                <p className="text-sm leading-relaxed text-[#999] pr-4">
                  {row.fela}
                </p>
                <p className="text-sm leading-relaxed text-[#999]">
                  {row.beyonce}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-6">
        <div className="divider" />
      </div>

      {/* Key moments */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <p className="font-[family-name:var(--font-geist-mono)] text-[0.7rem] tracking-[0.25em] uppercase text-[#888] mb-6">
            Key Influence Moments
          </p>
          <h2 className="font-[family-name:var(--font-playfair)] text-3xl leading-[1.1] tracking-[-0.02em] sm:text-4xl mb-12">
            The moments that
            <br />
            connected them.
          </h2>

          <div className="grid gap-8 sm:grid-cols-2">
            {[
              {
                year: "1969",
                title: "The LA Meeting",
                desc: "Fela Kuti meets James Brown's band in Los Angeles, absorbing funk methodology and Black Panther political consciousness. Returns to Nigeria and transforms his band into Africa 70.",
                color: "#34d399",
              },
              {
                year: "2011",
                title: "The Direct Sample",
                desc: 'Producer The Dream reveals Beyoncé recorded a 20-track album inspired by Fela Kuti. "End of Time" from 4 channels Fela\'s Afrobeat bass line aesthetic.',
                color: "#e8a849",
              },
              {
                year: "2017",
                title: "The Spiritual Inheritance",
                desc: "Erykah Badu curates Fela Kuti Box Set #4, positioning herself as his contemporary heir — interpreting his music through a neo-soul lens that Beyoncé absorbs.",
                color: "#a78bfa",
              },
              {
                year: "2019",
                title: "The Genre Bridge",
                desc: "Beyoncé recruits Afrobeats artists — Wizkid, Burna Boy, Tekno, Yemi Alade — for The Lion King: The Gift, completing the continent-spanning cycle Fela started.",
                color: "#f472b6",
              },
            ].map((moment) => (
              <div
                key={moment.year}
                className="border border-[#1a1a1a] bg-[#0e0e0e] p-8 hover:border-[#222] transition-all duration-300 group"
              >
                <p
                  className="font-[family-name:var(--font-playfair)] text-3xl mb-1 transition-all duration-300 group-hover:scale-105 origin-left"
                  style={{ color: moment.color }}
                >
                  {moment.year}
                </p>
                <h3 className="font-[family-name:var(--font-playfair)] text-xl mb-4">
                  {moment.title}
                </h3>
                <p className="text-sm leading-relaxed text-[#888]">
                  {moment.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-6">
        <div className="divider" />
      </div>

      {/* Why this matters */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-16 md:grid-cols-2">
            <div>
              <p className="font-[family-name:var(--font-geist-mono)] text-[0.7rem] tracking-[0.25em] uppercase text-[#888] mb-6">
                Why This Path Matters
              </p>
              <h2 className="font-[family-name:var(--font-playfair)] text-3xl leading-[1.1] tracking-[-0.02em] sm:text-4xl mb-8">
                Not algorithms.
                <br />
                Criticism.
              </h2>
              <p className="text-base leading-relaxed text-[#888] mb-6">
                Fela Kuti → Beyoncé shows how African musical traditions remain
                foundational to contemporary Black global pop — even when
                continents separate them, decades pass between them, and genres
                evolve dramatically.
              </p>
              <p className="text-base leading-relaxed text-[#888]">
                Streaming algorithms would never surface this connection. Crate
                finds it because music critics have been writing about it for
                decades.
              </p>
            </div>
            <div className="flex flex-col gap-6 border-l border-[#222] pl-12">
              {[
                {
                  stat: "8",
                  label: "Edges cached",
                  desc: "New connections added to the local knowledge graph",
                },
                {
                  stat: "0.95",
                  label: "Strongest signal",
                  desc: "Fela Kuti → James Brown (direct apprenticeship, 1969)",
                },
                {
                  stat: "26",
                  label: "Publications searched",
                  desc: "From Pitchfork and The Wire to NPR and The Guardian",
                },
                {
                  stat: "4",
                  label: "Paths discovered",
                  desc: "Direct, Neo-Soul, Funk Lineage, and Genre Bridge",
                },
              ].map((item) => (
                <div key={item.label} className="py-2">
                  <p className="font-[family-name:var(--font-playfair)] text-3xl text-[#e8a849] mb-0.5">
                    {item.stat}
                  </p>
                  <p className="font-[family-name:var(--font-geist-mono)] text-[0.6rem] tracking-[0.15em] uppercase text-[#888] mb-1">
                    {item.label}
                  </p>
                  <p className="text-xs leading-relaxed text-[#555]">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-6">
        <div className="divider" />
      </div>

      {/* CTA */}
      <section className="px-6 py-24 text-center">
        <div className="mx-auto max-w-3xl">
          <p className="font-[family-name:var(--font-geist-mono)] text-[0.7rem] tracking-[0.25em] uppercase text-[#888] mb-6">
            Try It Yourself
          </p>
          <h2 className="font-[family-name:var(--font-playfair)] text-3xl leading-[1.1] tracking-[-0.02em] sm:text-4xl mb-8">
            Trace any connection.
            <br />
            From any artist to any artist.
          </h2>
          <p className="text-base leading-relaxed text-[#888] mb-10 max-w-xl mx-auto">
            Crate is free and open source. Install it and ask: &ldquo;Trace the
            influence path from Sun Ra to Radiohead&rdquo; — or any connection
            you&apos;re curious about.
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
        <div className="mx-auto max-w-5xl flex flex-col items-center gap-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 w-full">
            <p className="font-[family-name:var(--font-geist-mono)] text-[0.6rem] tracking-[0.2em] uppercase text-[#555]">
              Influence methodology: Harvard Data Science Review, Issue 7.4, Fall
              2025
            </p>
            <Link
              href="/"
              className="font-[family-name:var(--font-geist-mono)] text-[0.6rem] tracking-[0.2em] uppercase text-[#555] hover:text-[#888] transition-colors"
            >
              ← Back to Crate
            </Link>
          </div>
          {/* Photo credits */}
          <details className="w-full">
            <summary className="font-[family-name:var(--font-geist-mono)] text-[0.55rem] tracking-[0.15em] uppercase text-[#444] cursor-pointer hover:text-[#666] transition-colors">
              Photo credits
            </summary>
            <div className="mt-2 font-[family-name:var(--font-geist-mono)] text-[0.5rem] text-[#444] leading-relaxed space-y-0.5">
              <p>Artist portraits via Wikimedia Commons.</p>
              <p>Fela Kuti (c. 1986) — Public Domain. Beyoncé — TixGirl Ames Friedman, CC BY 2.0.</p>
              <p>Erykah Badu — Patrik Hamberg, CC BY-SA 2.0. James Brown (1973) — Heinrich Klaffs, CC BY-SA 2.0.</p>
              <p>Missy Elliott (2006) — Romana Pierzga, CC BY-SA 2.0. Burna Boy — Ameyaw Debrah, CC BY-SA 3.0.</p>
              <p>Album artwork via Discogs.</p>
            </div>
          </details>
        </div>
      </footer>

      {/* Keyframe animation for timeline pulse */}
      <style jsx>{`
        @keyframes slideRight {
          0% {
            left: -33%;
          }
          100% {
            left: 100%;
          }
        }
      `}</style>
    </div>
  );
}
