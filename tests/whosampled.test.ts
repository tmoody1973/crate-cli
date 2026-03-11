// tests/whosampled.test.ts
// Unit tests for WhoSampled HTML parse functions — metadata-only extraction
import { describe, it, expect } from "vitest";
import {
  parseSearchResults,
  parseTrackSamples,
  parseArtistConnections,
} from "../src/servers/whosampled.js";

describe("parseSearchResults", () => {
  it("extracts top hit and list entries from real HTML structure", () => {
    const html = `
      <div class="topHit">
        <div class="title">
          <a class="trackTitle" href="/Kanye-West/Stronger/">Stronger</a>
          <span class="trackArtist">by <a href="/Kanye-West/">Kanye West</a></span>
        </div>
      </div>
      <ul>
        <li class="listEntry trackEntry">
          <span class="trackDetails">
            <a class="trackName" href="/Daft-Punk/Harder-Better-Faster-Stronger/" title="Daft Punk's Harder Better Faster Stronger">Harder Better Faster Stronger</a>
            <span class="trackArtist">by <a href="/Daft-Punk/">Daft Punk</a> (2001)</span>
          </span>
        </li>
        <li class="listEntry trackEntry">
          <span class="trackDetails">
            <a class="trackName" href="/Kanye-West/Stronger-Radio-Edit/" title="Kanye West's Stronger (Radio Edit)">Stronger (Radio Edit)</a>
            <span class="trackArtist">by <a href="/Kanye-West/">Kanye West</a> (2007)</span>
          </span>
        </li>
      </ul>
    `;

    const results = parseSearchResults(html);
    expect(results).toHaveLength(3);

    // Top hit
    expect(results[0]).toMatchObject({
      track: "Stronger",
      artist: "Kanye West",
      whosampled_url: expect.any(String),
    });
    expect(results[0]?.whosampled_url).toContain("/Kanye-West/Stronger/");

    // List entries
    expect(results[1]).toMatchObject({
      track: "Harder Better Faster Stronger",
      artist: "Daft Punk",
      whosampled_url: expect.any(String),
    });
    expect(results[1]?.whosampled_url).toContain("/Daft-Punk/Harder-Better-Faster-Stronger/");

    expect(results[2]).toMatchObject({
      track: "Stronger (Radio Edit)",
      artist: "Kanye West",
    });
  });

  it("deduplicates top hit that also appears in list entries", () => {
    const html = `
      <div class="topHit">
        <div class="title">
          <a class="trackTitle" href="/Kanye-West/Stronger/">Stronger</a>
          <span class="trackArtist">by <a href="/Kanye-West/">Kanye West</a></span>
        </div>
      </div>
      <ul>
        <li class="listEntry trackEntry">
          <span class="trackDetails">
            <a class="trackName" href="/Kanye-West/Stronger/" title="Kanye West's Stronger">Stronger</a>
            <span class="trackArtist">by <a href="/Kanye-West/">Kanye West</a> (2007)</span>
          </span>
        </li>
      </ul>
    `;

    const results = parseSearchResults(html);
    expect(results).toHaveLength(1);
    expect(results[0]?.track).toBe("Stronger");
  });

  it("returns empty array for no-results HTML", () => {
    const html = `
      <div class="noResults">
        <p>No results found for your search.</p>
      </div>
    `;
    const results = parseSearchResults(html);
    expect(results).toEqual([]);
  });

  it("returns empty array for empty HTML", () => {
    const results = parseSearchResults("");
    expect(results).toEqual([]);
  });
});

describe("parseTrackSamples", () => {
  it("extracts samples_used from track-connection with 'sampled' action", () => {
    const html = `
      <div class="trackConnections">
        <div class="track-connection">
          <span class="sampleAction">sampled</span>
          <ul>
            <li>
              <a href="/sample/89797/Mobb-Deep-Shook-Ones-Part-II-Herbie-Hancock-Jessica/" class="connectionName playIcon">Jessica</a>
              by <a href="/Herbie-Hancock/">Herbie Hancock</a> (1969)
            </li>
            <li>
              <a href="/sample/12345/Mobb-Deep-Shook-Ones-Part-II-Quincy-Jones-Kitty-With-the-Bent-Frame/" class="connectionName playIcon">Kitty With the Bent Frame</a>
              by <a href="/Quincy-Jones/">Quincy Jones</a> (1981)
            </li>
          </ul>
        </div>
      </div>
    `;

    const result = parseTrackSamples(html);
    expect(result.samples_used).toHaveLength(2);
    expect(result.samples_used[0]).toMatchObject({
      title: "Jessica",
      artist: "Herbie Hancock",
      year: 1969,
      type: "sample",
      whosampled_url: expect.stringContaining("/sample/89797/"),
    });
    expect(result.samples_used[1]).toMatchObject({
      title: "Kitty With the Bent Frame",
      artist: "Quincy Jones",
      year: 1981,
    });
    expect(result.sampled_by).toEqual([]);
  });

  it("extracts sampled_by from track-connection with 'was sampled in' action", () => {
    const html = `
      <div class="trackConnections">
        <div class="track-connection">
          <span class="sampleAction">was sampled in</span>
          <ul>
            <li>
              <a href="/sample/4048/Dilated-Peoples-Worst-Comes-to-Worst-Mobb-Deep-Shook-Ones-Part-II/" class="connectionName playIcon">Worst Comes to Worst</a>
              by <a href="/Dilated-Peoples/">Dilated Peoples</a> feat. <a href="/Guru/">Guru</a> (2001)
            </li>
            <li>
              <a href="/sample/9999/Drake-Started-From-the-Bottom/" class="connectionName playIcon">Started From the Bottom</a>
              by <a href="/Drake/">Drake</a> (2013)
            </li>
          </ul>
        </div>
      </div>
    `;

    const result = parseTrackSamples(html);
    expect(result.sampled_by).toHaveLength(2);
    expect(result.sampled_by[0]).toMatchObject({
      title: "Worst Comes to Worst",
      artist: "Dilated Peoples",
      year: 2001,
      whosampled_url: expect.stringContaining("/sample/4048/"),
    });
    expect(result.sampled_by[1]).toMatchObject({
      title: "Started From the Bottom",
      artist: "Drake",
      year: 2013,
    });
    expect(result.samples_used).toEqual([]);
  });

  it("handles both directions in same page", () => {
    const html = `
      <div class="trackConnections">
        <div class="track-connection">
          <span class="sampleAction">sampled</span>
          <ul>
            <li>
              <a href="/sample/100/orig/" class="connectionName playIcon">Original Song</a>
              by <a href="/OG-Artist/">OG Artist</a> (1975)
            </li>
          </ul>
        </div>
        <div class="track-connection">
          <span class="sampleAction">was sampled in</span>
          <ul>
            <li>
              <a href="/sample/200/new/" class="connectionName playIcon">New Song</a>
              by <a href="/New-Artist/">New Artist</a> (2020)
            </li>
          </ul>
        </div>
      </div>
    `;

    const result = parseTrackSamples(html);
    expect(result.samples_used).toHaveLength(1);
    expect(result.samples_used[0]?.title).toBe("Original Song");
    expect(result.sampled_by).toHaveLength(1);
    expect(result.sampled_by[0]?.title).toBe("New Song");
  });

  it("returns empty arrays for no-samples HTML", () => {
    const html = `
      <div class="trackPage">
        <h1>Some Track</h1>
        <p>No sample connections found.</p>
      </div>
    `;

    const result = parseTrackSamples(html);
    expect(result.samples_used).toEqual([]);
    expect(result.sampled_by).toEqual([]);
  });

  it("returns empty arrays for empty HTML", () => {
    const result = parseTrackSamples("");
    expect(result.samples_used).toEqual([]);
    expect(result.sampled_by).toEqual([]);
  });
});

describe("parseArtistConnections", () => {
  it("extracts stats and tracks from real artist page HTML", () => {
    const html = `
      <span class="section-header-title">1797 samples, 11 covers, 47 remixes</span>
      <a href="/Mobb-Deep/sampled/">Songs that Sampled Mobb Deep (1409)</a>

      <h3 class="trackName">
        <a itemprop="url" href="/Mobb-Deep/Shook-Ones-Part-II/" title="Mobb Deep's Shook Ones Part II">
          <span itemprop="name">Shook Ones Part II</span>
        </a> <span class="trackYear"> (1995)</span>
      </h3>
      <div class="trackConnections">
        <div class="track-connection">
          <span class="sampleAction">sampled</span>
          <ul>
            <li><a href="/sample/1/" class="connectionName">Jessica</a> by <a href="/Herbie-Hancock/">Herbie Hancock</a></li>
            <li><a href="/sample/2/" class="connectionName">Kitty</a> by <a href="/Quincy-Jones/">Quincy Jones</a></li>
          </ul>
        </div>
      </div>
      <a class="moreLink bordered-list moreConnections" href="/Mobb-Deep/Shook-Ones-Part-II/">see 234 more connections</a>

      <h3 class="trackName">
        <a itemprop="url" href="/Mobb-Deep/Survival-of-the-Fittest/" title="Mobb Deep's Survival of the Fittest">
          <span itemprop="name">Survival of the Fittest</span>
        </a> <span class="trackYear"> (1995)</span>
      </h3>
      <div class="trackConnections">
        <div class="track-connection">
          <span class="sampleAction">was sampled in</span>
          <ul>
            <li><a href="/sample/3/" class="connectionName">Some Track</a> by <a href="/Some-Artist/">Some Artist</a></li>
          </ul>
        </div>
      </div>
      <a class="moreLink bordered-list moreConnections" href="/Mobb-Deep/Survival-of-the-Fittest/">see 50 more connections</a>
    `;

    const result = parseArtistConnections(html);

    // Stats
    expect(result.total_samples_used).toBe(1797);
    expect(result.total_sampled_by).toBe(1409);

    // First track has "sampled" action -> top_sampling_tracks
    expect(result.top_sampling_tracks.length).toBeGreaterThanOrEqual(1);
    expect(result.top_sampling_tracks[0]).toMatchObject({
      track: "Shook Ones Part II",
      sample_count: expect.any(Number),
      whosampled_url: expect.stringContaining("/Mobb-Deep/Shook-Ones-Part-II/"),
    });
    // 2 <li> items + 234 more = 236
    expect(result.top_sampling_tracks[0]?.sample_count).toBe(236);

    // Second track has "was sampled in" action -> top_sampled_tracks
    expect(result.top_sampled_tracks.length).toBeGreaterThanOrEqual(1);
    expect(result.top_sampled_tracks[0]).toMatchObject({
      track: "Survival of the Fittest",
      whosampled_url: expect.stringContaining("/Mobb-Deep/Survival-of-the-Fittest/"),
    });
    // 1 <li> + 50 more = 51
    expect(result.top_sampled_tracks[0]?.sample_count).toBe(51);
  });

  it("returns empty arrays for artist with no connections", () => {
    const html = `
      <div class="artistPage">
        <h1>Unknown Artist</h1>
        <p>No sampling connections found.</p>
      </div>
    `;

    const result = parseArtistConnections(html);
    expect(result.top_sampled_tracks).toEqual([]);
    expect(result.top_sampling_tracks).toEqual([]);
  });

  it("returns empty arrays for empty HTML", () => {
    const result = parseArtistConnections("");
    expect(result.top_sampled_tracks).toEqual([]);
    expect(result.top_sampling_tracks).toEqual([]);
  });
});
