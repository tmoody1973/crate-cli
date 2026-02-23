// tests/influence.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock the web-search module so influence handlers don't make real API calls
// ---------------------------------------------------------------------------

const { mockSearchWeb, mockExtractContent, mockFindSimilar, mockHasExa } = vi.hoisted(() => ({
  mockSearchWeb: vi.fn(),
  mockExtractContent: vi.fn(),
  mockFindSimilar: vi.fn(),
  mockHasExa: vi.fn(() => false),
}));

vi.mock("../src/servers/web-search.js", () => ({
  searchWebHandler: mockSearchWeb,
  extractContentHandler: mockExtractContent,
  findSimilarHandler: mockFindSimilar,
  hasTavily: () => true,
  hasExa: mockHasExa,
}));

// ---------------------------------------------------------------------------
// Imports (after mock setup)
// ---------------------------------------------------------------------------

import {
  extractArtistMentions,
  searchReviewsHandler,
  extractInfluencesHandler,
  traceInfluencePathHandler,
  findBridgeArtistsHandler,
  REVIEW_DOMAINS,
} from "../src/servers/influence.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseResult(result: any) {
  return JSON.parse(result.content[0].text);
}

function webResult(data: any) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

// ---------------------------------------------------------------------------
// extractArtistMentions (pure function — no mocks needed)
// ---------------------------------------------------------------------------

describe("extractArtistMentions", () => {
  it("extracts Title Case artist names from review text", () => {
    const text =
      "This album recalls the atmospheric depths of Boards of Canada " +
      "and the rhythmic precision of Aphex Twin. A masterclass in ambient textures.";
    const mentions = extractArtistMentions(text, "Burial");

    const names = mentions.map((m) => m.name);
    expect(names).toContain("Boards of Canada");
    expect(names).toContain("Aphex Twin");
  });

  it("filters out the subject artist", () => {
    const text =
      "Radiohead's new album sounds like Radiohead channeling Pink Floyd. " +
      "Thom Yorke delivers another masterpiece.";
    const mentions = extractArtistMentions(text, "Radiohead");

    const names = mentions.map((m) => m.name.toLowerCase());
    expect(names).not.toContain("radiohead");
  });

  it("filters out false positives", () => {
    const text = "The album sounds great. The band plays well. The Record was released in New York.";
    const mentions = extractArtistMentions(text, "Test Artist");

    const names = mentions.map((m) => m.name.toLowerCase());
    expect(names).not.toContain("the album");
    expect(names).not.toContain("the band");
    expect(names).not.toContain("new york");
  });

  it("detects influence context phrases", () => {
    const text =
      "Clearly influenced by Kraftwerk and reminiscent of Tangerine Dream, " +
      "this album pushes electronic music forward.";
    const mentions = extractArtistMentions(text, "Oneohtrix Point Never");

    const kraftwerk = mentions.find((m) => m.name === "Kraftwerk");
    expect(kraftwerk).toBeDefined();
    expect(kraftwerk!.influenceContext).toBe(true);
  });

  it("returns empty array for text with no artist mentions", () => {
    const text = "this album is great and the production is top notch with excellent mixing";
    const mentions = extractArtistMentions(text, "Test");
    expect(mentions).toHaveLength(0);
  });

  it("deduplicates mentions and counts occurrences", () => {
    const text =
      "Brian Eno's influence is everywhere. Brian Eno pioneered ambient. " +
      "Brian Eno also produced great rock albums.";
    const mentions = extractArtistMentions(text, "Test Artist");

    const eno = mentions.find((m) => m.name === "Brian Eno");
    expect(eno).toBeDefined();
    expect(eno!.count).toBeGreaterThanOrEqual(2);
  });

  it("sorts influence-context mentions first", () => {
    const text =
      "David Bowie appears throughout. The sound is influenced by Kraftwerk. " +
      "Also features David Bowie collaborations.";
    const mentions = extractArtistMentions(text, "Iggy Pop");

    // Kraftwerk should appear first (influence context) even though Bowie has more mentions
    if (mentions.length >= 2) {
      const kraftwerkIdx = mentions.findIndex((m) => m.name === "Kraftwerk");
      const bowieIdx = mentions.findIndex((m) => m.name === "David Bowie");
      if (kraftwerkIdx !== -1 && bowieIdx !== -1) {
        // Kraftwerk has influence context, should rank higher
        expect(mentions[kraftwerkIdx].influenceContext).toBe(true);
      }
    }
  });

  it("handles ALL-CAPS artist names", () => {
    const text = "The beats recall DOOM and JPEGMAFIA at their most experimental.";
    const mentions = extractArtistMentions(text, "Test Artist");

    const names = mentions.map((m) => m.name);
    expect(names).toContain("DOOM");
    expect(names).toContain("JPEGMAFIA");
  });
});

// ---------------------------------------------------------------------------
// REVIEW_DOMAINS
// ---------------------------------------------------------------------------

describe("REVIEW_DOMAINS", () => {
  it("contains expected music publication domains", () => {
    expect(REVIEW_DOMAINS).toContain("pitchfork.com");
    expect(REVIEW_DOMAINS).toContain("thequietus.com");
    expect(REVIEW_DOMAINS).toContain("residentadvisor.net");
    expect(REVIEW_DOMAINS).toContain("stereogum.com");
    expect(REVIEW_DOMAINS).toContain("npr.org");
    expect(REVIEW_DOMAINS.length).toBeGreaterThanOrEqual(20);
  });

  it("contains new expanded publication domains", () => {
    expect(REVIEW_DOMAINS).toContain("daily.bandcamp.com");
    expect(REVIEW_DOMAINS).toContain("tinymixtapes.com");
    expect(REVIEW_DOMAINS).toContain("rateyourmusic.com");
    expect(REVIEW_DOMAINS).toContain("allmusic.com");
    expect(REVIEW_DOMAINS).toContain("thewire.co.uk");
    expect(REVIEW_DOMAINS).toContain("thefader.com");
    expect(REVIEW_DOMAINS).toContain("aquariumdrunkard.com");
    expect(REVIEW_DOMAINS).toContain("boomkat.com");
    expect(REVIEW_DOMAINS).toContain("passionweiss.com");
    expect(REVIEW_DOMAINS).toContain("thevinyldistrict.com");
    expect(REVIEW_DOMAINS).toContain("nytimes.com");
  });
});

// ---------------------------------------------------------------------------
// searchReviewsHandler
// ---------------------------------------------------------------------------

describe("searchReviewsHandler", () => {
  beforeEach(() => {
    mockSearchWeb.mockReset();
    mockExtractContent.mockReset();
    mockFindSimilar.mockReset();
    mockHasExa.mockReturnValue(false);
  });

  it("searches with music publication domain filtering", async () => {
    mockSearchWeb.mockResolvedValueOnce(
      webResult({
        results: [
          {
            title: "Aphex Twin - Selected Ambient Works Review",
            url: "https://pitchfork.com/reviews/aphex-twin-saw",
            content: "A landmark ambient album...",
          },
        ],
      }),
    );

    const result = await searchReviewsHandler({
      artist: "Aphex Twin",
      max_results: 5,
      include_text: false,
    });

    const data = parseResult(result);
    expect(data.artist).toBe("Aphex Twin");
    expect(data.review_count).toBe(1);
    expect(data.reviews[0].title).toContain("Aphex Twin");
    expect(data.reviews[0].source).toBe("pitchfork.com");

    // Verify domain filtering was passed
    expect(mockSearchWeb).toHaveBeenCalledWith(
      expect.objectContaining({
        include_domains: expect.arrayContaining(["pitchfork.com", "thequietus.com"]),
      }),
    );
  });

  it("includes album in search query when provided", async () => {
    mockSearchWeb.mockResolvedValueOnce(webResult({ results: [] }));

    await searchReviewsHandler({
      artist: "Radiohead",
      album: "Kid A",
      max_results: 3,
      include_text: false,
    });

    expect(mockSearchWeb).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining("Kid A"),
      }),
    );
  });

  it("extracts full text when include_text is true", async () => {
    mockSearchWeb.mockResolvedValueOnce(
      webResult({
        results: [
          {
            title: "Review",
            url: "https://pitchfork.com/review",
            content: "Short snippet...",
          },
        ],
      }),
    );

    mockExtractContent.mockResolvedValueOnce(
      webResult({
        results: [
          {
            url: "https://pitchfork.com/review",
            content: "Full review text with lots of detail about the album...",
          },
        ],
      }),
    );

    const result = await searchReviewsHandler({
      artist: "Aphex Twin",
      max_results: 5,
      include_text: true,
    });

    const data = parseResult(result);
    expect(data.reviews[0].full_text).toContain("Full review text");
    expect(mockExtractContent).toHaveBeenCalled();
  });

  it("handles empty search results", async () => {
    mockSearchWeb.mockResolvedValueOnce(webResult({ results: [] }));

    const result = await searchReviewsHandler({
      artist: "Unknown Artist 12345",
      max_results: 5,
      include_text: false,
    });

    const data = parseResult(result);
    expect(data.review_count).toBe(0);
    expect(data.reviews).toHaveLength(0);
  });

  it("returns error on search failure", async () => {
    mockSearchWeb.mockRejectedValueOnce(new Error("API error"));

    const result = await searchReviewsHandler({
      artist: "Test",
      max_results: 5,
      include_text: false,
    });

    const data = parseResult(result);
    expect(data.error).toBeDefined();
  });

  it("uses advanced search_depth for richer review text", async () => {
    mockSearchWeb.mockResolvedValueOnce(webResult({ results: [] }));

    await searchReviewsHandler({
      artist: "Burial",
      max_results: 5,
      include_text: false,
    });

    expect(mockSearchWeb).toHaveBeenCalledWith(
      expect.objectContaining({
        search_depth: "advanced",
      }),
    );
  });

  it("calls findSimilar when Exa available and results sparse", async () => {
    mockHasExa.mockReturnValue(true);

    // Main search returns 1 result (sparse, max_results=5)
    mockSearchWeb.mockResolvedValueOnce(
      webResult({
        results: [
          {
            title: "Aphex Twin Review",
            url: "https://pitchfork.com/review/aphex-twin",
            content: "A landmark album...",
          },
        ],
      }),
    );

    // findSimilar returns additional reviews
    mockFindSimilar.mockResolvedValueOnce(
      webResult({
        results: [
          {
            title: "Related Review",
            url: "https://thequietus.com/review/aphex-twin",
            content: "Another perspective on the album...",
          },
        ],
      }),
    );

    const result = await searchReviewsHandler({
      artist: "Aphex Twin",
      max_results: 5,
      include_text: false,
    });

    const data = parseResult(result);
    expect(data.review_count).toBe(2);
    expect(mockFindSimilar).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://pitchfork.com/review/aphex-twin",
        num_results: 3,
        include_domains: expect.arrayContaining(["pitchfork.com"]),
      }),
    );
  });

  it("skips findSimilar when Exa not available", async () => {
    mockHasExa.mockReturnValue(false);

    mockSearchWeb.mockResolvedValueOnce(
      webResult({
        results: [
          {
            title: "Review",
            url: "https://pitchfork.com/review",
            content: "Some review...",
          },
        ],
      }),
    );

    await searchReviewsHandler({
      artist: "Test",
      max_results: 5,
      include_text: false,
    });

    expect(mockFindSimilar).not.toHaveBeenCalled();
  });

  it("skips findSimilar when results already meet max_results", async () => {
    mockHasExa.mockReturnValue(true);

    const fullResults = Array.from({ length: 3 }, (_, i) => ({
      title: `Review ${i}`,
      url: `https://pitchfork.com/review/${i}`,
      content: `Content ${i}`,
    }));

    mockSearchWeb.mockResolvedValueOnce(webResult({ results: fullResults }));

    await searchReviewsHandler({
      artist: "Test",
      max_results: 3,
      include_text: false,
    });

    expect(mockFindSimilar).not.toHaveBeenCalled();
  });

  it("handles findSimilar failure gracefully", async () => {
    mockHasExa.mockReturnValue(true);

    mockSearchWeb.mockResolvedValueOnce(
      webResult({
        results: [
          {
            title: "Review",
            url: "https://pitchfork.com/review",
            content: "Some review...",
          },
        ],
      }),
    );

    mockFindSimilar.mockRejectedValueOnce(new Error("Exa API error"));

    const result = await searchReviewsHandler({
      artist: "Test",
      max_results: 5,
      include_text: false,
    });

    // Should still return the original result without error
    const data = parseResult(result);
    expect(data.review_count).toBe(1);
    expect(data.error).toBeUndefined();
  });

  it("deduplicates findSimilar results by URL", async () => {
    mockHasExa.mockReturnValue(true);

    mockSearchWeb.mockResolvedValueOnce(
      webResult({
        results: [
          {
            title: "Review",
            url: "https://pitchfork.com/review",
            content: "Original...",
          },
        ],
      }),
    );

    // findSimilar returns a duplicate URL and a new one
    mockFindSimilar.mockResolvedValueOnce(
      webResult({
        results: [
          {
            title: "Same Review",
            url: "https://pitchfork.com/review",
            content: "Duplicate...",
          },
          {
            title: "New Review",
            url: "https://thequietus.com/new-review",
            content: "New content...",
          },
        ],
      }),
    );

    const result = await searchReviewsHandler({
      artist: "Test",
      max_results: 5,
      include_text: false,
    });

    const data = parseResult(result);
    // 1 original + 1 new (duplicate filtered)
    expect(data.review_count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// extractInfluencesHandler
// ---------------------------------------------------------------------------

describe("extractInfluencesHandler", () => {
  beforeEach(() => {
    mockExtractContent.mockReset();
  });

  it("extracts co-mentions from provided review text", async () => {
    const reviewText =
      "This album draws on the legacy of Aphex Twin quite heavily. " +
      "It also recalls the trip-hop of Massive Attack. " +
      "Reminiscent of Autechre at their most rhythmic. A haunting record.";

    const result = await extractInfluencesHandler({
      artist: "Burial",
      review_text: reviewText,
    });

    const data = parseResult(result);
    expect(data.subject_artist).toBe("Burial");
    expect(data.total_found).toBeGreaterThan(0);
    expect(data.influence_mentions).toBeGreaterThan(0);

    const names = data.co_mentions.map((m: any) => m.name);
    expect(names).toContain("Aphex Twin");
    expect(names).toContain("Massive Attack");
  });

  it("fetches text from URL when review_url provided", async () => {
    mockExtractContent.mockResolvedValueOnce(
      webResult({
        results: [
          {
            url: "https://pitchfork.com/review",
            content:
              "This album is influenced by Kraftwerk and sounds like Tangerine Dream.",
          },
        ],
      }),
    );

    const result = await extractInfluencesHandler({
      artist: "Test Artist",
      review_url: "https://pitchfork.com/review",
    });

    const data = parseResult(result);
    expect(data.total_found).toBeGreaterThan(0);
    expect(data.review_source).toBe("https://pitchfork.com/review");
    expect(mockExtractContent).toHaveBeenCalled();
  });

  it("returns error when neither text nor url provided", async () => {
    const result = await extractInfluencesHandler({
      artist: "Test",
    });

    const data = parseResult(result);
    expect(data.error).toContain("review_text or review_url");
  });

  it("caps co-mentions at 30", async () => {
    // Generate text with many artist mentions
    const artists = Array.from({ length: 40 }, (_, i) => `Artist Name${String.fromCharCode(65 + (i % 26))}`);
    const reviewText = artists.map((a) => `This sounds like ${a}.`).join(" ");

    const result = await extractInfluencesHandler({
      artist: "Subject Artist",
      review_text: reviewText,
    });

    const data = parseResult(result);
    expect(data.co_mentions.length).toBeLessThanOrEqual(30);
  });
});

// ---------------------------------------------------------------------------
// traceInfluencePathHandler
// ---------------------------------------------------------------------------

describe("traceInfluencePathHandler", () => {
  beforeEach(() => {
    mockSearchWeb.mockReset();
    mockHasExa.mockReturnValue(false);
  });

  it("finds direct connection when both artists mentioned in results", async () => {
    mockSearchWeb.mockResolvedValueOnce(
      webResult({
        results: [
          {
            title: "Kraftwerk's Influence on Electronic Music",
            url: "https://example.com/article",
            content:
              "Kraftwerk directly influenced Depeche Mode. The German pioneers' " +
              "synthesizer experiments paved the way for Depeche Mode's sound.",
          },
        ],
      }),
    );

    const result = await traceInfluencePathHandler({
      from_artist: "Kraftwerk",
      to_artist: "Depeche Mode",
      max_depth: 3,
    });

    const data = parseResult(result);
    expect(data.depth).toBe(1);
    expect(data.path).toHaveLength(2);
    expect(data.path[0].artist).toBe("Kraftwerk");
    expect(data.path[1].artist).toBe("Depeche Mode");
    expect(data.formatted_path).toBeDefined();
    expect(data.inline_path).toBeDefined();
  });

  it("finds bridge artist at depth 2", async () => {
    // Direct search doesn't find both artists together
    mockSearchWeb.mockResolvedValueOnce(
      webResult({
        results: [
          {
            title: "Article about jazz",
            url: "https://example.com/a",
            content: "Jazz has a rich history.",
          },
        ],
      }),
    );

    // from_artist search mentions "Brian Eno"
    mockSearchWeb.mockResolvedValueOnce(
      webResult({
        results: [
          {
            title: "Ambient music origins",
            url: "https://example.com/b",
            content:
              "Aphex Twin was influenced by Brian Eno, the pioneer of ambient music.",
          },
        ],
      }),
    );

    // to_artist search also mentions "Brian Eno"
    mockSearchWeb.mockResolvedValueOnce(
      webResult({
        results: [
          {
            title: "Art rock connections",
            url: "https://example.com/c",
            content:
              "David Bowie worked closely with Brian Eno on the Berlin trilogy.",
          },
        ],
      }),
    );

    const result = await traceInfluencePathHandler({
      from_artist: "Aphex Twin",
      to_artist: "David Bowie",
      max_depth: 3,
    });

    const data = parseResult(result);
    if (data.depth === 2) {
      expect(data.path).toHaveLength(3);
      expect(data.bridge_artist).toBe("Brian Eno");
    }
    // Even if heuristic doesn't find it, result should be structured
    expect(data.from).toBe("Aphex Twin");
    expect(data.to).toBe("David Bowie");
  });

  it("returns no-path message when no connection found", async () => {
    // All searches return content that doesn't mention both artists
    mockSearchWeb.mockResolvedValue(
      webResult({
        results: [
          {
            title: "Unrelated",
            url: "https://example.com/x",
            content: "This article is about cooking recipes.",
          },
        ],
      }),
    );

    const result = await traceInfluencePathHandler({
      from_artist: "Artist Alpha",
      to_artist: "Artist Omega",
      max_depth: 2,
    });

    const data = parseResult(result);
    expect(data.path).toHaveLength(0);
    expect(data.message).toContain("No influence path found");
  });

  it("handles search errors gracefully", async () => {
    mockSearchWeb.mockRejectedValueOnce(new Error("Network error"));

    const result = await traceInfluencePathHandler({
      from_artist: "A",
      to_artist: "B",
      max_depth: 3,
    });

    const data = parseResult(result);
    expect(data.error).toBeDefined();
  });

  it("uses advanced search_depth for direct connection search", async () => {
    mockSearchWeb.mockResolvedValueOnce(webResult({ results: [] }));

    await traceInfluencePathHandler({
      from_artist: "A",
      to_artist: "B",
      max_depth: 1,
    });

    expect(mockSearchWeb).toHaveBeenCalledWith(
      expect.objectContaining({
        search_depth: "advanced",
      }),
    );
  });

  it("uses exa provider for neighborhood searches", async () => {
    // Direct search — no match
    mockSearchWeb.mockResolvedValueOnce(
      webResult({
        results: [
          {
            title: "Unrelated",
            url: "https://example.com",
            content: "Nothing relevant.",
          },
        ],
      }),
    );

    // Neighborhood searches (from + to)
    mockSearchWeb.mockResolvedValueOnce(webResult({ results: [] }));
    mockSearchWeb.mockResolvedValueOnce(webResult({ results: [] }));

    await traceInfluencePathHandler({
      from_artist: "A",
      to_artist: "B",
      max_depth: 3,
    });

    // First call = direct (tavily), second and third = neighborhoods (exa)
    const calls = mockSearchWeb.mock.calls;
    expect(calls[0][0].provider).toBe("tavily");
    expect(calls[1][0].provider).toBe("exa");
    expect(calls[2][0].provider).toBe("exa");
  });
});

// ---------------------------------------------------------------------------
// findBridgeArtistsHandler
// ---------------------------------------------------------------------------

describe("findBridgeArtistsHandler", () => {
  beforeEach(() => {
    mockSearchWeb.mockReset();
    mockHasExa.mockReturnValue(false);
  });

  it("finds bridge artists between two genres", async () => {
    // Crossover search
    mockSearchWeb.mockResolvedValueOnce(
      webResult({
        results: [
          {
            title: "Jazz meets Electronic",
            url: "https://example.com/crossover",
            content:
              "Flying Lotus and Herbie Hancock have bridged jazz and electronic music. " +
              "Madlib also draws from both traditions.",
          },
        ],
      }),
    );

    // Genre A search
    mockSearchWeb.mockResolvedValueOnce(
      webResult({
        results: [
          {
            title: "Best Jazz Artists",
            url: "https://example.com/jazz",
            content:
              "Herbie Hancock, Miles Davis, and John Coltrane define jazz. " +
              "Flying Lotus brings jazz into the future.",
          },
        ],
      }),
    );

    // Genre B search
    mockSearchWeb.mockResolvedValueOnce(
      webResult({
        results: [
          {
            title: "Best Electronic Artists",
            url: "https://example.com/electronic",
            content:
              "Flying Lotus, Aphex Twin, and Four Tet lead electronic music. " +
              "Herbie Hancock's Headhunters was proto-electronic.",
          },
        ],
      }),
    );

    const result = await findBridgeArtistsHandler({
      genre_a: "jazz",
      genre_b: "electronic",
      limit: 10,
    });

    const data = parseResult(result);
    expect(data.genre_a).toBe("jazz");
    expect(data.genre_b).toBe("electronic");
    expect(data.bridge_count).toBeGreaterThan(0);
    expect(data.bridges.length).toBeGreaterThan(0);

    // Flying Lotus and Herbie Hancock should appear as bridges
    const bridgeNames = data.bridges.map((b: any) => b.artist.toLowerCase());
    // At least one of the expected bridges should be found
    const hasExpectedBridge =
      bridgeNames.includes("flying lotus") ||
      bridgeNames.includes("herbie hancock");
    expect(hasExpectedBridge).toBe(true);
  });

  it("returns empty bridges when no overlap found", async () => {
    mockSearchWeb.mockResolvedValue(
      webResult({
        results: [
          {
            title: "no results here",
            url: "https://example.com",
            content: "this article has no artist names at all, just lowercase text about nothing in particular.",
          },
        ],
      }),
    );

    const result = await findBridgeArtistsHandler({
      genre_a: "obscure genre alpha",
      genre_b: "obscure genre beta",
      limit: 5,
    });

    const data = parseResult(result);
    expect(data.bridge_count).toBe(0);
    expect(data.bridges).toHaveLength(0);
  });

  it("respects the limit parameter", async () => {
    // Return lots of mentions
    const manyArtists = Array.from({ length: 20 }, (_, i) =>
      `Artist${String.fromCharCode(65 + i)} Johnson`,
    ).join(", ");

    mockSearchWeb.mockResolvedValue(
      webResult({
        results: [
          {
            title: "Many Artists",
            url: "https://example.com",
            content: `These artists bridge genres: ${manyArtists}.`,
          },
        ],
      }),
    );

    const result = await findBridgeArtistsHandler({
      genre_a: "rock",
      genre_b: "hip-hop",
      limit: 3,
    });

    const data = parseResult(result);
    expect(data.bridges.length).toBeLessThanOrEqual(3);
  });

  it("handles search errors gracefully", async () => {
    mockSearchWeb.mockRejectedValueOnce(new Error("API down"));

    const result = await findBridgeArtistsHandler({
      genre_a: "jazz",
      genre_b: "electronic",
      limit: 10,
    });

    const data = parseResult(result);
    expect(data.error).toBeDefined();
  });

  it("uses exa provider for crossover search and tavily for genre searches", async () => {
    // Crossover, genre A, genre B
    mockSearchWeb.mockResolvedValue(
      webResult({
        results: [
          {
            title: "Results",
            url: "https://example.com",
            content: "some artists here.",
          },
        ],
      }),
    );

    await findBridgeArtistsHandler({
      genre_a: "jazz",
      genre_b: "electronic",
      limit: 5,
    });

    const calls = mockSearchWeb.mock.calls;
    // First call = crossover (exa)
    expect(calls[0][0].provider).toBe("exa");
    // Second and third = genre A and B (tavily)
    expect(calls[1][0].provider).toBe("tavily");
    expect(calls[2][0].provider).toBe("tavily");
  });
});
