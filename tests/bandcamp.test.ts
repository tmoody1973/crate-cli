import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("bandcamp", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("bandcampFetch", () => {
    it("fetches with correct User-Agent header", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "<html>test</html>",
      });
      const { bandcampFetch } = await import("../src/servers/bandcamp.js");
      const result = await bandcampFetch("https://bandcamp.com/test");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://bandcamp.com/test",
        expect.objectContaining({
          headers: expect.objectContaining({
            "User-Agent": "Crate/1.0 (music-research-agent)",
          }),
        }),
      );
      expect(result).toBe("<html>test</html>");
    });

    it("returns null on fetch failure", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
      const { bandcampFetch } = await import("../src/servers/bandcamp.js");
      const result = await bandcampFetch("https://bandcamp.com/bad");
      expect(result).toBeNull();
    });

    it("returns null on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      const { bandcampFetch } = await import("../src/servers/bandcamp.js");
      const result = await bandcampFetch("https://bandcamp.com/fail");
      expect(result).toBeNull();
    });
  });

  describe("extractPagedata", () => {
    it("extracts and parses URL-encoded pagedata blob", async () => {
      const blob = encodeURIComponent(JSON.stringify({ name: "Test Artist" }));
      const html = `<div id="pagedata" data-blob="${blob}"></div>`;
      const { extractPagedata } = await import("../src/servers/bandcamp.js");
      const result = extractPagedata(html);
      expect(result).toEqual({ name: "Test Artist" });
    });

    it("returns null when no pagedata div exists", async () => {
      const { extractPagedata } = await import("../src/servers/bandcamp.js");
      const result = extractPagedata("<html><body>No data</body></html>");
      expect(result).toBeNull();
    });

    it("returns null on malformed JSON", async () => {
      const html = `<div id="pagedata" data-blob="not%20json"></div>`;
      const { extractPagedata } = await import("../src/servers/bandcamp.js");
      const result = extractPagedata(html);
      expect(result).toBeNull();
    });
  });

  describe("resolveLocation", () => {
    it("resolves city name to GeoNames results", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          ok: true,
          results: [
            { id: "5263045", name: "Milwaukee", fullname: "Milwaukee, Wisconsin" },
            { id: "4479663", name: "Milwaukee", fullname: "Milwaukee, North Carolina" },
          ],
        }),
      });

      const { resolveLocation } = await import("../src/servers/bandcamp.js");
      const results = await resolveLocation("Milwaukee");

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe(5263045);
      expect(results[0].fullname).toBe("Milwaukee, Wisconsin");
    });

    it("returns empty array on failure", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const { resolveLocation } = await import("../src/servers/bandcamp.js");
      const results = await resolveLocation("Nowhere");
      expect(results).toEqual([]);
    });
  });

  describe("extractTralbum", () => {
    it("extracts tralbum data from script attribute", async () => {
      const tralbum = JSON.stringify({
        trackinfo: [{ title: "Track 1", duration: 180 }],
      });
      const html = `<script data-tralbum='${tralbum}'></script>`;
      const { extractTralbum } = await import("../src/servers/bandcamp.js");
      const result = extractTralbum(html);
      expect(result).toEqual({
        trackinfo: [{ title: "Track 1", duration: 180 }],
      });
    });

    it("extracts HTML-entity-encoded tralbum from double-quoted attribute", async () => {
      const html = `<script data-tralbum="{&quot;trackinfo&quot;:[{&quot;title&quot;:&quot;Song One&quot;,&quot;duration&quot;:200}]}"></script>`;
      const { extractTralbum } = await import("../src/servers/bandcamp.js");
      const result = extractTralbum(html);
      expect(result).toEqual({
        trackinfo: [{ title: "Song One", duration: 200 }],
      });
    });

    it("returns null when no tralbum data exists", async () => {
      const { extractTralbum } = await import("../src/servers/bandcamp.js");
      const result = extractTralbum("<html><body>No tralbum</body></html>");
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // searchBandcampHandler
  // -------------------------------------------------------------------------
  describe("searchBandcampHandler", () => {
    it("returns parsed search results", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <div class="result-items">
            <li class="searchresult band">
              <div class="result-info">
                <div class="heading"><a href="https://artist.bandcamp.com">Test Artist</a></div>
                <div class="subhead">band</div>
                <div class="itemurl"><a href="https://artist.bandcamp.com">artist.bandcamp.com</a></div>
                <div class="tags">electronic, ambient</div>
                <div class="location">Portland, Oregon</div>
              </div>
              <div class="art"><img src="https://f4.bcbits.com/img/123.jpg"></div>
            </li>
            <li class="searchresult album">
              <div class="result-info">
                <div class="heading"><a href="https://artist.bandcamp.com/album/test">Test Album</a></div>
                <div class="subhead">by Test Artist</div>
                <div class="itemurl"><a href="https://artist.bandcamp.com/album/test">artist.bandcamp.com</a></div>
                <div class="tags">electronic</div>
              </div>
              <div class="art"><img src="https://f4.bcbits.com/img/456.jpg"></div>
            </li>
          </div>
        `,
      });

      const { searchBandcampHandler } = await import("../src/servers/bandcamp.js");
      const result = await searchBandcampHandler({ query: "test artist" });
      const data = JSON.parse(result.content[0].text);

      expect(data.query).toBe("test artist");
      expect(data.result_count).toBe(2);
      expect(data.results[0].type).toBe("artist");
      expect(data.results[0].name).toBe("Test Artist");
      expect(data.results[0].url).toBe("https://artist.bandcamp.com");
      expect(data.results[1].type).toBe("album");
      expect(data.results[1].artist).toBe("Test Artist");
    });

    it("handles item_type filter in URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `<div class="result-items"></div>`,
      });

      const { searchBandcampHandler } = await import("../src/servers/bandcamp.js");
      await searchBandcampHandler({ query: "test", item_type: "album" });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain("item_type=a");
    });

    it("passes location parameter in search URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `<div class="result-items"></div>`,
      });

      const { searchBandcampHandler } = await import("../src/servers/bandcamp.js");
      await searchBandcampHandler({ query: "hip hop", item_type: "artist", location: "Milwaukee" });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain("location=Milwaukee");
      expect(calledUrl).toContain("item_type=b");
    });

    it("returns error on fetch failure", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const { searchBandcampHandler } = await import("../src/servers/bandcamp.js");
      const result = await searchBandcampHandler({ query: "test" });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // getArtistPageHandler
  // -------------------------------------------------------------------------
  describe("getArtistPageHandler", () => {
    it("returns artist profile from pagedata", async () => {
      const pagedata = encodeURIComponent(JSON.stringify({
        bio: { text: "An electronic artist from Portland." },
        name: "Test Artist",
        band_id: 12345,
        image_id: 67890,
        discography: [
          {
            title: "First Album",
            page_url: "/album/first",
            item_type: "album",
            release_date: "01 Jan 2024 00:00:00 GMT",
            art_id: 111,
          },
        ],
        bandLinks: [{ url: "https://twitter.com/artist" }],
      }));

      // First fetch: artist page HTML
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<div id="pagedata" data-blob="${pagedata}"></div>
           <p id="band-name-location"><span class="location">Portland, Oregon</span></p>`,
      });

      // Second fetch: RSS feed
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0"?>
          <rss version="2.0">
            <channel>
              <item>
                <title>New Release</title>
                <link>https://artist.bandcamp.com/album/new</link>
                <pubDate>Mon, 15 Jan 2024 00:00:00 GMT</pubDate>
              </item>
            </channel>
          </rss>`,
      });

      const { getArtistPageHandler } = await import("../src/servers/bandcamp.js");
      const result = await getArtistPageHandler({ url: "https://artist.bandcamp.com" });
      const data = JSON.parse(result.content[0].text);

      expect(data.name).toBe("Test Artist");
      expect(data.band_id).toBe(12345);
      expect(data.bio).toBe("An electronic artist from Portland.");
      expect(data.discography).toHaveLength(1);
      expect(data.discography[0].title).toBe("First Album");
      expect(data.discography[0].type).toBe("album");
      expect(data.links).toContain("https://twitter.com/artist");
      expect(data.recent_feed).toHaveLength(1);
      expect(data.recent_feed[0].title).toBe("New Release");
    });

    it("returns error on fetch failure", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      const { getArtistPageHandler } = await import("../src/servers/bandcamp.js");
      const result = await getArtistPageHandler({ url: "https://bad.bandcamp.com" });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBeDefined();
    });

    it("works without RSS feed", async () => {
      const pagedata = encodeURIComponent(JSON.stringify({
        name: "Minimal Artist",
        discography: [],
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `<div id="pagedata" data-blob="${pagedata}"></div>`,
      });

      // RSS feed fails
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      const { getArtistPageHandler } = await import("../src/servers/bandcamp.js");
      const result = await getArtistPageHandler({ url: "https://minimal.bandcamp.com" });
      const data = JSON.parse(result.content[0].text);

      expect(data.name).toBe("Minimal Artist");
      expect(data.recent_feed).toBeUndefined();
    });

    it("falls back to DOM scraping when pagedata has no discography", async () => {
      // Pagedata with no discography key (like real Boards of Canada page)
      const pagedata = `{&quot;cfg&quot;:{},&quot;templglobals&quot;:{}}`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<div id="pagedata" data-blob="${pagedata}"></div>
           <meta property="og:title" content="Test Band" />
           <span class="location">Edinburgh, UK</span>
           <ol id="music-grid">
             <li class="music-grid-item">
               <a href="/album/first-album">
                 <img src="https://f4.bcbits.com/img/a111_2.jpg" />
               </a>
               <p class="title">First Album</p>
             </li>
             <li class="music-grid-item">
               <a href="/track/single-track">
                 <img src="/img/0.gif" />
               </a>
               <p class="title">Single Track</p>
             </li>
           </ol>`,
      });

      // RSS feed
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      const { getArtistPageHandler } = await import("../src/servers/bandcamp.js");
      const result = await getArtistPageHandler({ url: "https://test.bandcamp.com" });
      const data = JSON.parse(result.content[0].text);

      expect(data.name).toBe("Test Band");
      expect(data.discography).toHaveLength(2);
      expect(data.discography[0].title).toBe("First Album");
      expect(data.discography[0].type).toBe("album");
      expect(data.discography[0].url).toBe("https://test.bandcamp.com/album/first-album");
      expect(data.discography[0].art_url).toBe("https://f4.bcbits.com/img/a111_2.jpg");
      expect(data.discography[1].title).toBe("Single Track");
      expect(data.discography[1].type).toBe("track");
      // Placeholder images (0.gif) should be excluded
      expect(data.discography[1].art_url).toBeUndefined();
    });
  });


  // -------------------------------------------------------------------------
  // getAlbumHandler
  // -------------------------------------------------------------------------
  describe("getAlbumHandler", () => {
    it("returns album details with tracklist", async () => {
      const pagedata = encodeURIComponent(JSON.stringify({
        current: {
          title: "Test Album",
          artist: "Test Artist",
          about: "A great album.",
          credits: "Produced by Test Artist",
          release_date: "01 Mar 2024 00:00:00 GMT",
          minimum_price: 7.0,
          currency: "USD",
        },
        art_id: 999,
        album_release_date: "01 Mar 2024 00:00:00 GMT",
      }));

      const tralbum = JSON.stringify({
        trackinfo: [
          { track_num: 1, title: "Intro", duration: 62.5, artist: null },
          { track_num: 2, title: "Main Track", duration: 245.8, artist: "Featured Artist" },
        ],
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<div id="pagedata" data-blob="${pagedata}"></div>
           <script data-tralbum='${tralbum}'></script>
           <a class="tag" href="/tag/electronic">electronic</a>
           <a class="tag" href="/tag/ambient">ambient</a>
           <span class="label"><a href="https://label.bandcamp.com">Cool Label</a></span>`,
      });

      const { getAlbumHandler } = await import("../src/servers/bandcamp.js");
      const result = await getAlbumHandler({ url: "https://artist.bandcamp.com/album/test" });
      const data = JSON.parse(result.content[0].text);

      expect(data.title).toBe("Test Album");
      expect(data.artist).toBe("Test Artist");
      expect(data.about).toBe("A great album.");
      expect(data.credits).toBe("Produced by Test Artist");
      expect(data.tracks).toHaveLength(2);
      expect(data.tracks[0].number).toBe(1);
      expect(data.tracks[0].title).toBe("Intro");
      expect(data.tracks[0].duration_seconds).toBeCloseTo(62.5);
      expect(data.tracks[0].duration_formatted).toBe("1:03");
      expect(data.tracks[1].artist).toBe("Featured Artist");
      expect(data.price).toEqual({ amount: 7.0, currency: "USD" });
    });

    it("returns error on fetch failure", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      const { getAlbumHandler } = await import("../src/servers/bandcamp.js");
      const result = await getAlbumHandler({ url: "https://artist.bandcamp.com/album/bad" });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // discoverMusicHandler
  // -------------------------------------------------------------------------
  describe("discoverMusicHandler", () => {
    it("returns discover results from internal API", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          items: [
            {
              primary_text: "Ambient Album",
              secondary_text: "Ambient Artist",
              url_hints: { custom_domain: null, slug: "ambient-artist", item_type: "a", item_slug: "ambient-album" },
              art_id: 555,
              genre_text: "ambient",
              release_date: "01 Feb 2024 00:00:00 GMT",
            },
          ],
        }),
      });

      const { discoverMusicHandler } = await import("../src/servers/bandcamp.js");
      const result = await discoverMusicHandler({ tag: "ambient" });
      const data = JSON.parse(result.content[0].text);

      expect(data.tag).toBe("ambient");
      expect(data.result_count).toBe(1);
      expect(data.items[0].title).toBe("Ambient Album");
      expect(data.items[0].artist).toBe("Ambient Artist");

      // Verify POST request
      const callArgs = mockFetch.mock.calls[0];
      const init = callArgs[1] as RequestInit;
      expect(init.method).toBe("POST");
      const body = JSON.parse(init.body as string);
      expect(body.tag_norm_names).toEqual(["ambient"]);
      expect(body.geoname_id).toBe(0);
    });

    it("passes sort and format parameters via POST body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ items: [] }),
      });

      const { discoverMusicHandler } = await import("../src/servers/bandcamp.js");
      await discoverMusicHandler({ tag: "electronic", sort: "new", format: "vinyl" });

      const callArgs = mockFetch.mock.calls[0];
      const calledUrl = callArgs[0] as string;
      expect(calledUrl).toBe("https://bandcamp.com/api/discover/1/discover_web");

      const init = callArgs[1] as RequestInit;
      expect(init.method).toBe("POST");
      const body = JSON.parse(init.body as string);
      expect(body.tag_norm_names).toEqual(["electronic"]);
      expect(body.slice).toBe("date");
      expect(body.category_id).toBe(2); // vinyl
    });

    it("resolves location string to geoname_id", async () => {
      // First call: geoname_search for location resolution
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          ok: true,
          results: [{ id: "5263045", name: "Milwaukee", fullname: "Milwaukee, Wisconsin" }],
        }),
      });
      // Second call: discover_web POST
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          items: [
            {
              primary_text: "Local Album",
              secondary_text: "MKE Artist",
              url_hints: { custom_domain: null, slug: "mke-artist", item_type: "a", item_slug: "local-album" },
              featured_track: { band_location: "Milwaukee, Wisconsin" },
            },
          ],
        }),
      });

      const { discoverMusicHandler } = await import("../src/servers/bandcamp.js");
      const result = await discoverMusicHandler({ tag: "hip-hop-rap", location: "Milwaukee" });
      const data = JSON.parse(result.content[0].text);

      expect(data.location).toBe("Milwaukee, Wisconsin");
      expect(data.geoname_id).toBe(5263045);
      expect(data.items[0].title).toBe("Local Album");
      expect(data.items[0].location).toBe("Milwaukee, Wisconsin");

      // Verify discover POST body has the resolved geoname_id
      const discoverCall = mockFetch.mock.calls[1];
      const body = JSON.parse((discoverCall[1] as RequestInit).body as string);
      expect(body.geoname_id).toBe(5263045);
    });

    it("returns error on fetch failure", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const { discoverMusicHandler } = await import("../src/servers/bandcamp.js");
      const result = await discoverMusicHandler({ tag: "electronic" });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // getTagInfoHandler
  // -------------------------------------------------------------------------
  describe("getTagInfoHandler", () => {
    it("returns tag info with related tags", async () => {
      const pagedata = encodeURIComponent(JSON.stringify({
        hub: {
          description: "Music that creates atmosphere and texture over rhythm.",
          related_tags: [
            { tag_norm_name: "drone" },
            { tag_norm_name: "dark-ambient" },
            { tag_norm_name: "experimental" },
          ],
        },
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `<div id="pagedata" data-blob="${pagedata}"></div>`,
      });

      const { getTagInfoHandler } = await import("../src/servers/bandcamp.js");
      const result = await getTagInfoHandler({ tag: "ambient" });
      const data = JSON.parse(result.content[0].text);

      expect(data.tag).toBe("ambient");
      expect(data.description).toBe("Music that creates atmosphere and texture over rhythm.");
      expect(data.related_tags).toEqual(["drone", "dark-ambient", "experimental"]);
    });

    it("returns error on fetch failure", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      const { getTagInfoHandler } = await import("../src/servers/bandcamp.js");
      const result = await getTagInfoHandler({ tag: "nonexistent" });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // getBandcampEditorialHandler
  // -------------------------------------------------------------------------
  describe("getBandcampEditorialHandler", () => {
    it("returns articles from RSS feed in browse mode", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0"?>
          <rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
            <channel>
              <title>Bandcamp Daily</title>
              <item>
                <title>The Best Ambient of 2024</title>
                <link>https://daily.bandcamp.com/lists/best-ambient-2024</link>
                <pubDate>Mon, 15 Jan 2024 00:00:00 GMT</pubDate>
                <dc:creator>Andrew Jervis</dc:creator>
                <category>Lists</category>
              </item>
              <item>
                <title>Scene Report: Tokyo Underground</title>
                <link>https://daily.bandcamp.com/scene-report/tokyo-underground</link>
                <pubDate>Sun, 14 Jan 2024 00:00:00 GMT</pubDate>
                <dc:creator>Casey Jarman</dc:creator>
                <category>Scene Report</category>
              </item>
            </channel>
          </rss>`,
      });

      const { getBandcampEditorialHandler } = await import("../src/servers/bandcamp.js");
      const result = await getBandcampEditorialHandler({});
      const data = JSON.parse(result.content[0].text);

      expect(data.source).toBe("Bandcamp Daily");
      expect(data.article_count).toBe(2);
      expect(data.articles[0].title).toBe("The Best Ambient of 2024");
      expect(data.articles[0].author).toBe("Andrew Jervis");
      expect(data.articles[1].title).toBe("Scene Report: Tokyo Underground");
    });

    it("filters articles by category in browse mode", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `<?xml version="1.0"?>
          <rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
            <channel>
              <item>
                <title>Best Lists Article</title>
                <link>https://daily.bandcamp.com/lists/best-ambient-2024</link>
                <pubDate>Mon, 15 Jan 2024 00:00:00 GMT</pubDate>
                <dc:creator>Author A</dc:creator>
                <category>Lists</category>
              </item>
              <item>
                <title>Feature Article</title>
                <link>https://daily.bandcamp.com/features/some-feature</link>
                <pubDate>Sun, 14 Jan 2024 00:00:00 GMT</pubDate>
                <dc:creator>Author B</dc:creator>
                <category>Features</category>
              </item>
            </channel>
          </rss>`,
      });

      const { getBandcampEditorialHandler } = await import("../src/servers/bandcamp.js");
      const result = await getBandcampEditorialHandler({ category: "lists" });
      const data = JSON.parse(result.content[0].text);

      expect(data.category).toBe("lists");
      expect(data.article_count).toBe(1);
      expect(data.articles[0].title).toBe("Best Lists Article");
    });

    it("extracts article content and release links in read mode", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html>
          <head>
            <meta property="og:title" content="The Best Ambient of 2024" />
            <meta property="article:published_time" content="2024-01-15T00:00:00Z" />
            <script type="application/ld+json">{"author":{"name":"Andrew Jervis"}}</script>
          </head>
          <article>
            <p>This year saw incredible ambient releases.</p>
            <p>First up is <a href="https://artist1.bandcamp.com/album/dreamscapes">Dreamscapes</a> by Artist One.</p>
            <p>Also essential: <a href="https://artist2.bandcamp.com/album/deep-blue">Deep Blue</a>.</p>
            <p>Don't miss <a href="https://artist3.bandcamp.com/track/horizon">Horizon</a> either.</p>
          </article></html>`,
      });

      const { getBandcampEditorialHandler } = await import("../src/servers/bandcamp.js");
      const result = await getBandcampEditorialHandler({
        url: "https://daily.bandcamp.com/lists/best-ambient-2024",
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.title).toBe("The Best Ambient of 2024");
      expect(data.author).toBe("Andrew Jervis");
      expect(data.date).toBe("2024-01-15T00:00:00Z");
      expect(data.body_text).toContain("incredible ambient releases");
      expect(data.release_count).toBe(3);
      expect(data.releases[0].url).toBe("https://artist1.bandcamp.com/album/dreamscapes");
      expect(data.releases[0].title).toBe("Dreamscapes");
    });

    it("extracts releases from player embeds", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html><article>
            <h1>Album of the Day: Night Visions</h1>
            <p>A stunning debut from Aurora.</p>
            <div class="mplayer">
              <span class="mpalbuminfo">
                <a class="mptralbum" href="https://aurora.bandcamp.com/album/night-visions">Night Visions</a>
                <a class="mpartist" href="https://aurora.bandcamp.com">Aurora</a>
              </span>
            </div>
          </article></html>`,
      });

      const { getBandcampEditorialHandler } = await import("../src/servers/bandcamp.js");
      const result = await getBandcampEditorialHandler({
        url: "https://daily.bandcamp.com/album-of-the-day/night-visions",
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.releases).toHaveLength(1);
      expect(data.releases[0].url).toBe("https://aurora.bandcamp.com/album/night-visions");
      expect(data.releases[0].title).toBe("Night Visions");
      expect(data.releases[0].artist).toBe("Aurora");
    });

    it("deduplicates releases by URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html><article>
            <h1>Feature</h1>
            <p>Check out <a href="https://a.bandcamp.com/album/x">Album X</a>.</p>
            <p>As mentioned, <a href="https://a.bandcamp.com/album/x">Album X by A</a> is great.</p>
            <p>Also <a href="https://a.bandcamp.com/album/x?from=embed">Album X</a>.</p>
          </article></html>`,
      });

      const { getBandcampEditorialHandler } = await import("../src/servers/bandcamp.js");
      const result = await getBandcampEditorialHandler({
        url: "https://daily.bandcamp.com/features/test",
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.release_count).toBe(1);
      expect(data.releases[0].url).toBe("https://a.bandcamp.com/album/x");
    });

    it("rejects non-Bandcamp-Daily URLs", async () => {
      const { getBandcampEditorialHandler } = await import("../src/servers/bandcamp.js");
      const result = await getBandcampEditorialHandler({
        url: "https://artist.bandcamp.com/album/something",
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain("daily.bandcamp.com");
    });

    it("returns error when RSS feed fetch fails", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const { getBandcampEditorialHandler } = await import("../src/servers/bandcamp.js");
      const result = await getBandcampEditorialHandler({});
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBeDefined();
    });

    it("returns error when article fetch fails", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      const { getBandcampEditorialHandler } = await import("../src/servers/bandcamp.js");
      const result = await getBandcampEditorialHandler({
        url: "https://daily.bandcamp.com/features/nonexistent",
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // get_artist_tracks
  // -------------------------------------------------------------------------
  describe("getArtistTracksHandler", () => {
    const searchResultHtml = `<html><div class="searchresult band">
      <div class="heading"><a href="https://tomppabeats.bandcamp.com?from=search">Tomppabeats</a></div>
    </div></html>`;

    const artistPagedata = {
      name: "Tomppabeats",
      discography: [
        { item_type: "album", page_url: "/album/harbor", title: "Harbor" },
        { item_type: "album", page_url: "/album/departed", title: "Departed" },
      ],
    };

    const makeArtistHtml = (pd: object) => {
      const blob = encodeURIComponent(JSON.stringify(pd));
      return `<html><div id="pagedata" data-blob="${blob}"></div></html>`;
    };

    const makeAlbumHtml = (title: string, tracks: { title: string; track_num?: number; duration?: number; artist?: string }[]) => {
      const tralbum = JSON.stringify({ trackinfo: tracks });
      const pd = encodeURIComponent(JSON.stringify({ current: { title } }));
      return `<html><div id="pagedata" data-blob="${pd}"></div><div data-tralbum='${tralbum}'></div></html>`;
    };

    it("searches for artist, fetches albums, and returns flat tracklist", async () => {
      // 1) search
      mockFetch.mockResolvedValueOnce({ ok: true, text: async () => searchResultHtml });
      // 2) artist page
      mockFetch.mockResolvedValueOnce({ ok: true, text: async () => makeArtistHtml(artistPagedata) });
      // 3) album 1
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => makeAlbumHtml("Harbor", [
          { title: "Monday Loop", track_num: 1, duration: 112 },
          { title: "Sunlit Room", track_num: 2, duration: 95 },
        ]),
      });
      // 4) album 2
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => makeAlbumHtml("Departed", [
          { title: "Goodbye", track_num: 1, duration: 140 },
        ]),
      });

      const { getArtistTracksHandler } = await import("../src/servers/bandcamp.js");
      const result = await getArtistTracksHandler({ artist: "Tomppabeats" });
      const data = JSON.parse(result.content[0].text);

      expect(data.artist).toBe("Tomppabeats");
      expect(data.artist_url).toBe("https://tomppabeats.bandcamp.com");
      expect(data.albums_scanned).toBe(2);
      expect(data.albums_total).toBe(2);
      expect(data.track_count).toBe(3);
      expect(data.tracks[0].title).toBe("Monday Loop");
      expect(data.tracks[0].album).toBe("Harbor");
      expect(data.tracks[0].number).toBe(1);
      expect(data.tracks[0].duration).toBe("1:52");
      expect(data.tracks[2].title).toBe("Goodbye");
      expect(data.tracks[2].album).toBe("Departed");
    }, 15_000);

    it("skips search step when direct URL is provided", async () => {
      // 1) artist page (no search call)
      mockFetch.mockResolvedValueOnce({ ok: true, text: async () => makeArtistHtml(artistPagedata) });
      // 2) album 1
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => makeAlbumHtml("Harbor", [
          { title: "Monday Loop", track_num: 1, duration: 112 },
        ]),
      });
      // 3) album 2
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => makeAlbumHtml("Departed", [
          { title: "Goodbye", track_num: 1, duration: 140 },
        ]),
      });

      const { getArtistTracksHandler } = await import("../src/servers/bandcamp.js");
      const result = await getArtistTracksHandler({
        artist: "Tomppabeats",
        url: "https://tomppabeats.bandcamp.com",
      });
      const data = JSON.parse(result.content[0].text);

      // No search call — first call should be the artist page URL, not search
      expect(mockFetch.mock.calls[0][0]).toBe("https://tomppabeats.bandcamp.com");
      expect(data.artist).toBe("Tomppabeats");
      expect(data.track_count).toBe(2);
    }, 10_000);

    it("returns error when artist search fails", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const { getArtistTracksHandler } = await import("../src/servers/bandcamp.js");
      const result = await getArtistTracksHandler({ artist: "NonexistentArtist" });
      const data = JSON.parse(result.content[0].text);

      expect(data.error).toContain("No Bandcamp results");
    });

    it("returns error when artist not found in search results", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "<html><div>No results</div></html>",
      });

      const { getArtistTracksHandler } = await import("../src/servers/bandcamp.js");
      const result = await getArtistTracksHandler({ artist: "NonexistentArtist" });
      const data = JSON.parse(result.content[0].text);

      expect(data.error).toContain("not found on Bandcamp");
    });

    it("returns error when artist page fetch fails", async () => {
      // 1) search succeeds
      mockFetch.mockResolvedValueOnce({ ok: true, text: async () => searchResultHtml });
      // 2) artist page fails
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      const { getArtistTracksHandler } = await import("../src/servers/bandcamp.js");
      const result = await getArtistTracksHandler({ artist: "Tomppabeats" });
      const data = JSON.parse(result.content[0].text);

      expect(data.error).toContain("Failed to fetch artist page");
    });

    it("respects max_albums parameter", async () => {
      const bigDiscography = {
        name: "Prolific Artist",
        discography: Array.from({ length: 8 }, (_, i) => ({
          item_type: "album",
          page_url: `/album/album-${i + 1}`,
          title: `Album ${i + 1}`,
        })),
      };

      // 1) artist page
      mockFetch.mockResolvedValueOnce({ ok: true, text: async () => makeArtistHtml(bigDiscography) });
      // 2) only 2 album fetches (max_albums=2)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => makeAlbumHtml("Album 1", [{ title: "Track A", track_num: 1 }]),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => makeAlbumHtml("Album 2", [{ title: "Track B", track_num: 1 }]),
      });

      const { getArtistTracksHandler } = await import("../src/servers/bandcamp.js");
      const result = await getArtistTracksHandler({
        artist: "Prolific Artist",
        url: "https://prolific.bandcamp.com",
        max_albums: 2,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.albums_scanned).toBe(2);
      expect(data.albums_total).toBe(8);
      expect(data.track_count).toBe(2);
      // Should have fetched artist page + 2 albums = 3 calls
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("uses DOM fallback when pagedata has no discography", async () => {
      const domArtistHtml = `<html>
        <meta property="og:title" content="Lo-Fi Producer" />
        <div id="music-grid">
          <li><a href="/album/chill-beats">link</a><p class="title">Chill Beats</p></li>
          <li><a href="/track/single-track">link</a><p class="title">Single</p></li>
        </div>
      </html>`;

      // 1) artist page (no pagedata, DOM fallback)
      mockFetch.mockResolvedValueOnce({ ok: true, text: async () => domArtistHtml });
      // 2) album fetch (the /track/ link should be skipped)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => makeAlbumHtml("Chill Beats", [{ title: "Rainy Day", track_num: 1, duration: 180 }]),
      });

      const { getArtistTracksHandler } = await import("../src/servers/bandcamp.js");
      const result = await getArtistTracksHandler({
        artist: "Lo-Fi Producer",
        url: "https://lofi.bandcamp.com",
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.artist).toBe("Lo-Fi Producer");
      // Only the album link, not the /track/ link
      expect(data.albums_scanned).toBe(1);
      expect(data.tracks[0].title).toBe("Rainy Day");
    });

    it("skips failed album fetches gracefully", async () => {
      // 1) artist page
      mockFetch.mockResolvedValueOnce({ ok: true, text: async () => makeArtistHtml(artistPagedata) });
      // 2) album 1 fails
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      // 3) album 2 succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => makeAlbumHtml("Departed", [{ title: "Goodbye", track_num: 1 }]),
      });

      const { getArtistTracksHandler } = await import("../src/servers/bandcamp.js");
      const result = await getArtistTracksHandler({
        artist: "Tomppabeats",
        url: "https://tomppabeats.bandcamp.com",
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.track_count).toBe(1);
      expect(data.tracks[0].title).toBe("Goodbye");
    });

    it("omits track artist field when it matches the main artist", async () => {
      // 1) artist page
      mockFetch.mockResolvedValueOnce({ ok: true, text: async () => makeArtistHtml({ name: "MainArtist", discography: [{ item_type: "album", page_url: "/album/collab", title: "Collab" }] }) });
      // 2) album with mixed artists
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => makeAlbumHtml("Collab", [
          { title: "Solo Track", track_num: 1, artist: "MainArtist" },
          { title: "Guest Track", track_num: 2, artist: "FeaturedArtist" },
        ]),
      });

      const { getArtistTracksHandler } = await import("../src/servers/bandcamp.js");
      const result = await getArtistTracksHandler({
        artist: "MainArtist",
        url: "https://mainartist.bandcamp.com",
      });
      const data = JSON.parse(result.content[0].text);

      // Solo track should NOT have artist field (matches main artist)
      expect(data.tracks[0].artist).toBeUndefined();
      // Guest track SHOULD have artist field (different from main artist)
      expect(data.tracks[1].artist).toBe("FeaturedArtist");
    });
  });

});
