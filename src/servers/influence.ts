// src/servers/influence.ts
/**
 * Influence Network MCP server — review-driven artist discovery
 * using co-mention analysis from music publication reviews.
 *
 * Based on the Stell-R methodology (Harvard Data Science Review, 2025):
 * artist co-mentions in music reviews are a powerful proxy for artistic
 * influence and connection.
 *
 * Requires TAVILY_API_KEY and/or EXA_API_KEY (reuses web-search credentials).
 */

import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import {
  searchWebHandler,
  extractContentHandler,
  hasTavily,
  hasExa,
} from "./web-search.js";
import { renderInfluencePath, renderInlineChain } from "../utils/viz.js";
import type { PathStep, Connection } from "../utils/viz.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Music publication domains known for quality reviews */
export const REVIEW_DOMAINS = [
  "pitchfork.com",
  "thequietus.com",
  "residentadvisor.net",
  "stereogum.com",
  "brooklynvegan.com",
  "factmag.com",
  "nme.com",
  "consequence.net",
  "npr.org",
  "theguardian.com",
  "sputnikmusic.com",
  "goutemesdisques.com",
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ToolResult = { content: [{ type: "text"; text: string }] };

function toolResult(data: unknown): ToolResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

function toolError(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }] };
}

/** Truncate text for token efficiency */
function truncate(text: string, maxChars: number = 2000): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "…";
}

// ---------------------------------------------------------------------------
// Artist mention extraction
// ---------------------------------------------------------------------------

export interface CoMention {
  name: string;
  context: string; // Surrounding snippet where the mention was found
  count: number; // Times mentioned
  influenceContext: boolean; // Found in an influence-indicator phrase
}

/** Common false positives to filter out */
const FALSE_POSITIVES = new Set([
  "the album", "the band", "the song", "the record", "the track",
  "the artist", "the singer", "the group", "the label", "the music",
  "the sound", "the production", "new york", "los angeles", "united states",
  "the guardian", "the quietus", "rolling stone", "the wire",
  "best new", "album of", "song of", "track of", "record of",
  "south london", "north london", "east london", "west london",
]);

/** Phrases that indicate an influence relationship */
const INFLUENCE_PHRASES = [
  /(?:influenced?\s+by|inspired\s+by|echoes?\s+of|channeling|reminiscent\s+of)/i,
  /(?:in\s+the\s+(?:vein|mold|tradition)\s+of|compared\s+to|likened\s+to)/i,
  /(?:sounds?\s+like|recalls?|evokes?|nods?\s+to|pays?\s+(?:tribute|homage)\s+to)/i,
  /(?:owes?\s+(?:a\s+)?debt\s+to|draws?\s+(?:from|on)|borrows?\s+from)/i,
  /(?:following\s+in\s+the\s+footsteps?\s+of|descended\s+from|heir\s+to)/i,
];

/**
 * Extract artist co-mentions from review text using heuristics.
 * Returns names that appear to be artist references, with context.
 *
 * Strategy:
 * 1. Title Case multi-word sequences (mid-sentence = likely proper nouns)
 * 2. Influence phrase contexts ("influenced by X", "reminiscent of X")
 * 3. Filter out the subject artist and known false positives
 */
export function extractArtistMentions(
  text: string,
  subjectArtist: string,
): CoMention[] {
  const mentions = new Map<string, CoMention>();
  const subjectLower = subjectArtist.toLowerCase();
  // Also catch partial matches (e.g., filtering "Radiohead" when subject is "Radiohead")
  const subjectParts = subjectLower.split(/\s+/).filter((p) => p.length > 2);

  // Pattern 1: Title Case sequences that look like artist names
  // Matches: "Aphex Twin", "My Bloody Valentine", "DJ Shadow", "MF DOOM"
  const titleCasePattern =
    /(?:(?:The |A |An |DJ |MC |MF |El |De |La |St\.\s?|Mr\.\s?|Dr\.\s?)?[A-Z][a-zà-ú]+(?:[\s-]+(?:and\s+(?:the\s+)?|&\s+|of\s+(?:the\s+)?|the\s+)?[A-Z][a-zà-ú]+){0,4})/g;

  // Pattern 2: ALL-CAPS names (e.g., "DOOM", "JPEGMAFIA", "LCD Soundsystem")
  const allCapsPattern = /\b[A-Z][A-Z0-9]{2,}(?:\s+[A-Z][A-Z0-9]{2,})*\b/g;

  const addMention = (name: string, context: string, isInfluenceCtx: boolean) => {
    const normalized = name.trim();
    if (normalized.length < 3) return;

    const lowerName = normalized.toLowerCase();

    // Filter out subject artist
    if (lowerName === subjectLower) return;
    if (subjectParts.some((p) => lowerName === p)) return;
    if (lowerName.includes(subjectLower) || subjectLower.includes(lowerName)) return;

    // Filter false positives
    if (FALSE_POSITIVES.has(lowerName)) return;

    // Filter common non-artist words
    if (/^(the|this|that|their|there|these|those|which|where|when|what|while|since|after|before|about|above|below)$/i.test(normalized)) return;
    // Filter sentence starters (words at very start of a sentence followed by common verb)
    if (/^[A-Z][a-z]+$/.test(normalized) && normalized.length < 5) return;

    const existing = mentions.get(lowerName);
    if (existing) {
      existing.count++;
      if (isInfluenceCtx) existing.influenceContext = true;
    } else {
      mentions.set(lowerName, {
        name: normalized,
        context: truncate(context, 150),
        count: 1,
        influenceContext: isInfluenceCtx,
      });
    }
  };

  // Extract sentence-level chunks for context
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);

  for (const sentence of sentences) {
    // Check if sentence contains influence language
    const hasInfluenceCtx = INFLUENCE_PHRASES.some((p) => p.test(sentence));

    // Title case matches
    for (const match of sentence.matchAll(titleCasePattern)) {
      addMention(match[0], sentence.trim(), hasInfluenceCtx);
    }

    // ALL-CAPS matches
    for (const match of sentence.matchAll(allCapsPattern)) {
      // Filter out common all-caps words
      if (/^(THE|AND|FOR|WITH|THIS|THAT|FROM|HAVE|BEEN|WILL|JUST|MORE|ALSO|THAN|VERY|MOST|BEST)$/.test(match[0])) continue;
      addMention(match[0], sentence.trim(), hasInfluenceCtx);
    }
  }

  // Sort by: influence context first, then by count
  return Array.from(mentions.values()).sort((a, b) => {
    if (a.influenceContext !== b.influenceContext) return a.influenceContext ? -1 : 1;
    return b.count - a.count;
  });
}

// ---------------------------------------------------------------------------
// Handler functions (exported for testing)
// ---------------------------------------------------------------------------

export async function searchReviewsHandler(args: {
  artist: string;
  album?: string;
  max_results: number;
  include_text: boolean;
}) {
  try {
    const { artist, album, max_results, include_text } = args;

    // Build search query
    const query = album
      ? `"${artist}" "${album}" album review`
      : `"${artist}" album review`;

    // Search with music publication domain filtering
    const searchResult = await searchWebHandler({
      query,
      provider: "tavily",
      search_depth: "basic",
      topic: "general",
      include_domains: [...REVIEW_DOMAINS],
      max_results,
    });

    const searchData = JSON.parse(searchResult.content[0].text);

    // Optionally extract full text from review URLs
    let reviews = (searchData.results ?? []).map((r: any) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      source: extractDomain(r.url ?? ""),
      snippet: r.content ?? r.summary ?? "",
      full_text: undefined as string | undefined,
    }));

    if (include_text && hasTavily() && reviews.length > 0) {
      const urls = reviews.slice(0, 3).map((r: any) => r.url); // Limit to 3 for cost
      try {
        const extractResult = await extractContentHandler({
          urls,
          extract_depth: "basic",
        });
        const extractData = JSON.parse(extractResult.content[0].text);
        const extractedMap = new Map(
          (extractData.results ?? [])
            .filter((r: any) => !r.failed)
            .map((r: any) => [r.url, r.content]),
        );
        reviews = reviews.map((r: any) => ({
          ...r,
          full_text: extractedMap.get(r.url) ?? undefined,
        }));
      } catch {
        // Extraction is best-effort; proceed with snippets
      }
    }

    return toolResult({
      artist,
      album: album ?? null,
      review_count: reviews.length,
      reviews,
    });
  } catch (err) {
    return toolError(err);
  }
}

export async function extractInfluencesHandler(args: {
  artist: string;
  review_text?: string;
  review_url?: string;
}) {
  try {
    const { artist, review_text, review_url } = args;

    if (!review_text && !review_url) {
      return toolError("Provide either review_text or review_url");
    }

    let text = review_text ?? "";

    // Fetch text from URL if needed
    if (review_url && !review_text) {
      if (!hasTavily()) {
        return toolError("extract_content requires Tavily. Provide review_text directly instead.");
      }
      const extractResult = await extractContentHandler({
        urls: [review_url],
        extract_depth: "basic",
      });
      const extractData = JSON.parse(extractResult.content[0].text);
      const extracted = (extractData.results ?? []).find((r: any) => !r.failed);
      if (!extracted) {
        return toolError(`Could not extract text from ${review_url}`);
      }
      text = extracted.content;
    }

    const coMentions = extractArtistMentions(text, artist);

    return toolResult({
      subject_artist: artist,
      co_mentions: coMentions.slice(0, 30), // Cap at 30 for token efficiency
      total_found: coMentions.length,
      influence_mentions: coMentions.filter((m) => m.influenceContext).length,
      review_source: args.review_url ?? "provided_text",
    });
  } catch (err) {
    return toolError(err);
  }
}

export async function traceInfluencePathHandler(args: {
  from_artist: string;
  to_artist: string;
  max_depth: number;
}) {
  try {
    const { from_artist, to_artist, max_depth } = args;

    // Strategy: Use web search to find connections between the two artists
    // Try direct connection first, then expand
    const explored: string[] = [];
    const path: PathStep[] = [];

    // Step 1: Search for direct connection
    const directQuery = `"${from_artist}" "${to_artist}" influence connection music`;
    const directResult = await searchWebHandler({
      query: directQuery,
      provider: "tavily",
      search_depth: "basic",
      topic: "general",
      max_results: 3,
    });
    const directData = JSON.parse(directResult.content[0].text);
    explored.push(from_artist, to_artist);

    // Check if results mention both artists (direct connection)
    const directContent = (directData.results ?? [])
      .map((r: any) => r.content ?? "")
      .join(" ");

    if (
      directContent.toLowerCase().includes(from_artist.toLowerCase()) &&
      directContent.toLowerCase().includes(to_artist.toLowerCase())
    ) {
      // Direct connection found
      const evidence = (directData.results ?? [])
        .slice(0, 1)
        .map((r: any) => `${extractDomain(r.url)}: "${truncate(r.content ?? "", 100)}"`)
        .join("; ");

      path.push(
        { artist: from_artist, connection: "connected", evidence },
        { artist: to_artist },
      );

      const formatted = renderInfluencePath(path);
      const inline = renderInlineChain([from_artist, to_artist]);

      return toolResult({
        from: from_artist,
        to: to_artist,
        path,
        depth: 1,
        total_explored: explored.length,
        formatted_path: formatted,
        inline_path: inline,
      });
    }

    // Step 2: Search for intermediate connections
    if (max_depth >= 2) {
      // Search for artists commonly associated with both
      const fromQuery = `"${from_artist}" similar artists influenced review`;
      const toQuery = `"${to_artist}" similar artists influenced review`;

      const [fromResult, toResult] = await Promise.all([
        searchWebHandler({
          query: fromQuery,
          provider: "tavily",
          search_depth: "basic",
          topic: "general",
          max_results: 3,
        }),
        searchWebHandler({
          query: toQuery,
          provider: "tavily",
          search_depth: "basic",
          topic: "general",
          max_results: 3,
        }),
      ]);

      const fromData = JSON.parse(fromResult.content[0].text);
      const toData = JSON.parse(toResult.content[0].text);

      // Extract text from both results
      const fromText = (fromData.results ?? []).map((r: any) => r.content ?? "").join(" ");
      const toText = (toData.results ?? []).map((r: any) => r.content ?? "").join(" ");

      // Extract artist mentions from both
      const fromMentions = extractArtistMentions(fromText, from_artist);
      const toMentions = extractArtistMentions(toText, to_artist);

      // Find overlap — artists mentioned in context of both
      const fromNames = new Set(fromMentions.map((m) => m.name.toLowerCase()));
      const bridgeArtists = toMentions.filter((m) =>
        fromNames.has(m.name.toLowerCase()) &&
        m.name.toLowerCase() !== from_artist.toLowerCase() &&
        m.name.toLowerCase() !== to_artist.toLowerCase(),
      );

      if (bridgeArtists.length > 0) {
        const bridge = bridgeArtists[0]!;
        const fromEvidence = fromMentions.find(
          (m) => m.name.toLowerCase() === bridge.name.toLowerCase(),
        );

        path.push(
          {
            artist: from_artist,
            connection: "connected via reviews",
            evidence: fromEvidence?.context ? truncate(fromEvidence.context, 80) : undefined,
          },
          {
            artist: bridge.name,
            connection: "connected via reviews",
            evidence: bridge.context ? truncate(bridge.context, 80) : undefined,
          },
          { artist: to_artist },
        );

        explored.push(bridge.name);

        const formatted = renderInfluencePath(path);
        const inline = renderInlineChain([from_artist, bridge.name, to_artist]);

        return toolResult({
          from: from_artist,
          to: to_artist,
          path,
          depth: 2,
          bridge_artist: bridge.name,
          total_explored: explored.length,
          formatted_path: formatted,
          inline_path: inline,
        });
      }
    }

    // No path found within depth
    return toolResult({
      from: from_artist,
      to: to_artist,
      path: [],
      depth: 0,
      total_explored: explored.length,
      message: `No influence path found between ${from_artist} and ${to_artist} within depth ${max_depth}. Try increasing max_depth or using get_similar_artists on each to explore their neighborhoods manually.`,
    });
  } catch (err) {
    return toolError(err);
  }
}

export async function findBridgeArtistsHandler(args: {
  genre_a: string;
  genre_b: string;
  limit: number;
}) {
  try {
    const { genre_a, genre_b, limit } = args;

    // Search for artists that cross both genres
    const query = `artists "${genre_a}" "${genre_b}" crossover bridge genre influence`;
    const searchResult = await searchWebHandler({
      query,
      provider: "tavily",
      search_depth: "advanced",
      topic: "general",
      max_results: 5,
    });
    const searchData = JSON.parse(searchResult.content[0].text);

    // Extract artist mentions from results
    const allText = (searchData.results ?? [])
      .map((r: any) => `${r.title ?? ""} ${r.content ?? ""}`)
      .join(" ");

    // Use a combined subject to filter out the genre names themselves
    const mentions = extractArtistMentions(allText, `${genre_a} ${genre_b}`);

    // Also search specifically for each genre to find overlap
    const [genreAResult, genreBResult] = await Promise.all([
      searchWebHandler({
        query: `best "${genre_a}" artists`,
        provider: "tavily",
        search_depth: "basic",
        topic: "general",
        max_results: 3,
      }),
      searchWebHandler({
        query: `best "${genre_b}" artists`,
        provider: "tavily",
        search_depth: "basic",
        topic: "general",
        max_results: 3,
      }),
    ]);

    const genreAData = JSON.parse(genreAResult.content[0].text);
    const genreBData = JSON.parse(genreBResult.content[0].text);

    const genreAText = (genreAData.results ?? []).map((r: any) => r.content ?? "").join(" ");
    const genreBText = (genreBData.results ?? []).map((r: any) => r.content ?? "").join(" ");

    const genreAMentions = extractArtistMentions(genreAText, genre_a);
    const genreBMentions = extractArtistMentions(genreBText, genre_b);

    // Find artists appearing in both genre contexts
    const genreANames = new Set(genreAMentions.map((m) => m.name.toLowerCase()));
    const genreBOverlap = genreBMentions.filter((m) => genreANames.has(m.name.toLowerCase()));

    // Combine crossover mentions with direct bridge search mentions
    const allBridges = new Map<string, { name: string; evidence: string[]; score: number }>();

    for (const m of mentions.slice(0, limit * 2)) {
      const key = m.name.toLowerCase();
      if (!allBridges.has(key)) {
        allBridges.set(key, {
          name: m.name,
          evidence: [m.context],
          score: m.influenceContext ? 2 : 1,
        });
      }
    }

    for (const m of genreBOverlap) {
      const key = m.name.toLowerCase();
      const existing = allBridges.get(key);
      if (existing) {
        existing.score += 2; // Bonus for appearing in both genre searches
        existing.evidence.push(`Mentioned in both ${genre_a} and ${genre_b} contexts`);
      } else {
        allBridges.set(key, {
          name: m.name,
          evidence: [`Found in both ${genre_a} and ${genre_b} searches`],
          score: 2,
        });
      }
    }

    // Sort by score and take top results
    const bridges = Array.from(allBridges.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((b) => ({
        artist: b.name,
        evidence: b.evidence[0],
        score: b.score,
      }));

    return toolResult({
      genre_a,
      genre_b,
      bridge_count: bridges.length,
      bridges,
      sources_searched: (searchData.results ?? []).length +
        (genreAData.results ?? []).length +
        (genreBData.results ?? []).length,
    });
  } catch (err) {
    return toolError(err);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const searchReviews = tool(
  "search_reviews",
  "Search music publications for album reviews. Returns reviews from Pitchfork, " +
    "The Quietus, Resident Advisor, Stereogum, BrooklynVegan, FACT, NME, NPR, " +
    "and other quality sources. Use for finding critical reception and extracting " +
    "artist co-mentions as influence signals.",
  {
    artist: z.string().max(200).describe("Artist name to find reviews for"),
    album: z.string().max(200).optional().describe(
      "Specific album title. If omitted, searches for all reviews of the artist.",
    ),
    max_results: z.number().min(1).max(10).default(5).describe("Max reviews to return (default 5)"),
    include_text: z.boolean().default(false).describe(
      "If true, extract full review text (slower, uses 1 additional API credit per 5 URLs). " +
        "If false, returns search snippets only. Set true when you need to analyze the full review.",
    ),
  },
  searchReviewsHandler,
);

const extractInfluences = tool(
  "extract_influences",
  "Extract artist co-mentions from review text as influence signals. " +
    "Given review text (or a URL to fetch), identifies other artists mentioned " +
    "in the review and whether they appear in influence-indicating phrases " +
    '("influenced by", "reminiscent of", "in the vein of", etc.). ' +
    "The co-mention pattern — Artist B mentioned in a review of Artist A — " +
    "is a meaningful proxy for artistic influence or connection.",
  {
    artist: z.string().max(200).describe(
      "The artist being reviewed. This artist is filtered out of co-mention results.",
    ),
    review_text: z.string().max(10000).optional().describe(
      "Review text to analyze. Provide this OR review_url, not both.",
    ),
    review_url: z.string().url().optional().describe(
      "URL of a review to fetch and analyze. Requires Tavily. Provide this OR review_text.",
    ),
  },
  extractInfluencesHandler,
);

const traceInfluencePath = tool(
  "trace_influence_path",
  "Find a chain of influence connections between two artists. " +
    "Uses web search to find review co-mentions and critical discussion linking " +
    "the artists. Returns a path like: Artist A → Bridge Artist → Artist B " +
    "with evidence for each link. Works best for artists within 1-3 degrees of separation.",
  {
    from_artist: z.string().max(200).describe("Starting artist"),
    to_artist: z.string().max(200).describe("Target artist"),
    max_depth: z.number().min(2).max(5).default(3).describe(
      "Maximum chain length (default 3). Higher values explore more but take longer.",
    ),
  },
  traceInfluencePathHandler,
);

const findBridgeArtists = tool(
  "find_bridge_artists",
  "Find artists that bridge two genres, scenes, or musical traditions. " +
    "Bridge artists are those who connect otherwise disconnected musical communities — " +
    "they appear in the influence neighborhoods of both genres. " +
    'Example: "jazz" and "electronic" might return Herbie Hancock, Flying Lotus, Madlib.',
  {
    genre_a: z.string().max(100).describe(
      "First genre, scene, or style (e.g., 'jazz', 'Detroit techno', 'shoegaze')",
    ),
    genre_b: z.string().max(100).describe("Second genre, scene, or style"),
    limit: z.number().min(1).max(20).default(10).describe("Max bridge artists to return (default 10)"),
  },
  findBridgeArtistsHandler,
);

// ---------------------------------------------------------------------------
// Server export
// ---------------------------------------------------------------------------

export const influenceServer = createSdkMcpServer({
  name: "influence",
  version: "1.0.0",
  tools: [searchReviews, extractInfluences, traceInfluencePath, findBridgeArtists],
});
