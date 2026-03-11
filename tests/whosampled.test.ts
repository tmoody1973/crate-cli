// tests/whosampled.test.ts
// Unit tests for WhoSampled HTML parse functions — metadata-only extraction
import { describe, it, expect } from "vitest";
import {
  parseSearchResults,
  parseTrackSamples,
  parseArtistConnections,
} from "../src/servers/whosampled.js";

describe("parseSearchResults", () => {
  it("extracts results from HTML with track links and artist spans", () => {
    const html = `
      <div class="searchResult">
        <a href="/Kanye-West/Stronger/">Stronger</a>
        <span class="artist">Kanye West</span>
        <span>5 samples</span>
      </div>
      <div class="searchResult">
        <a href="/Daft-Punk/Harder-Better-Faster-Stronger/">Harder Better Faster Stronger</a>
        <span class="artist">Daft Punk</span>
        <span>sampled by 12</span>
      </div>
    `;

    const results = parseSearchResults(html);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      track: "Stronger",
      artist: "Kanye West",
      whosampled_url: expect.any(String),
    });
    expect(results[0]?.whosampled_url).toContain("/Kanye-West/Stronger/");
    expect(results[0]?.sample_count).toBe(5);

    expect(results[1]).toMatchObject({
      track: "Harder Better Faster Stronger",
      artist: "Daft Punk",
      whosampled_url: expect.any(String),
    });
    expect(results[1]?.sampled_by_count).toBe(12);
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
  it("extracts samples_used section", () => {
    const html = `
      <h3>Contains samples of</h3>
      <div class="sampleEntry">
        <a href="/Daft-Punk/Harder-Better-Faster-Stronger/">Harder Better Faster Stronger</a>
        <span>by Daft Punk</span>
        <span>2001</span>
      </div>
      <h3>Was sampled by</h3>
      <div class="sampleEntry">
        <p>No entries.</p>
      </div>
    `;

    const result = parseTrackSamples(html);
    expect(result.samples_used.length).toBeGreaterThanOrEqual(1);
    expect(result.samples_used[0]).toMatchObject({
      title: expect.any(String),
      whosampled_url: expect.any(String),
    });
    expect(result.samples_used[0]?.whosampled_url).toContain("/Daft-Punk/");
  });

  it("extracts sampled_by section", () => {
    const html = `
      <h3>Contains samples of</h3>
      <div class="empty">None</div>
      <h3>Was sampled in</h3>
      <div class="sampleEntry">
        <a href="/Kanye-West/Stronger/">Stronger</a>
        <span>by Kanye West</span>
        <span>2007</span>
        <span>sample</span>
      </div>
      <div class="sampleEntry">
        <a href="/Kid-Cudi/Day-'N'-Nite/">Day 'N' Nite</a>
        <span>by Kid Cudi</span>
        <span>2009</span>
        <span>interpolation</span>
      </div>
    `;

    const result = parseTrackSamples(html);
    expect(result.sampled_by.length).toBeGreaterThanOrEqual(1);
    expect(result.sampled_by[0]).toMatchObject({
      title: expect.any(String),
      whosampled_url: expect.any(String),
    });
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
  it("extracts top tracks from artist page HTML", () => {
    const html = `
      <div>
        <span>15 samples of other tracks</span>
        <span>sampled by 42 other tracks</span>
      </div>
      <h3>Top sampling tracks</h3>
      <div class="trackList">
        <a href="/Kanye-West/Stronger/">Stronger</a>
        <span>5 sample connections</span>
        <a href="/Kanye-West/Through-the-Wire/">Through the Wire</a>
        <span>3 sample connections</span>
      </div>
      <h3>Most sampled tracks</h3>
      <div class="trackList">
        <a href="/Kanye-West/Gold-Digger/">Gold Digger</a>
        <span>8 sample connections</span>
      </div>
    `;

    const result = parseArtistConnections(html);
    expect(result.top_sampling_tracks.length).toBeGreaterThanOrEqual(1);
    expect(result.top_sampling_tracks[0]).toMatchObject({
      track: expect.any(String),
      sample_count: expect.any(Number),
      whosampled_url: expect.any(String),
    });

    expect(result.top_sampled_tracks.length).toBeGreaterThanOrEqual(1);
    expect(result.top_sampled_tracks[0]).toMatchObject({
      track: expect.any(String),
      whosampled_url: expect.any(String),
    });
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
