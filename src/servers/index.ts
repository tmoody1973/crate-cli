// src/servers/index.ts
import { musicbrainzServer } from "./musicbrainz.js";
import { discogsServer } from "./discogs.js";
import { geniusServer } from "./genius.js";
import { lastfmServer } from "./lastfm.js";
import { wikipediaServer } from "./wikipedia.js";
import { bandcampServer } from "./bandcamp.js";
import { youtubeServer } from "./youtube.js";
import { collectionServer } from "./collection.js";
import { playlistServer } from "./playlist.js";
import { memoryServer } from "./memory.js";
import { radioServer } from "./radio.js";
import { newsServer } from "./news.js";
import { webSearchServer, hasTavily, hasExa } from "./web-search.js";
import { influenceServer } from "./influence.js";
import { influenceCacheServer } from "./influence-cache.js";
import { telegraphServer } from "./telegraph.js";
import { tumblrServer } from "./tumblr.js";
import { browserServer } from "./browser.js";
import { whoSampledServer } from "./whosampled.js";

export function getActiveServers(keys?: Record<string, string>): Record<string, any> {
  const hasKey = (envVar: string): boolean => !!(keys?.[envVar] || process.env[envVar]);

  const servers: Record<string, any> = {
    musicbrainz: musicbrainzServer,
  };

  // Key-gated servers:
  if (hasKey("DISCOGS_KEY") && hasKey("DISCOGS_SECRET"))
    servers.discogs = discogsServer;
  if (hasKey("MEM0_API_KEY")) servers.memory = memoryServer;
  if (hasKey("LASTFM_API_KEY")) servers.lastfm = lastfmServer;
  // if (hasKey("SPOTIFY_CLIENT_ID") && hasKey("SPOTIFY_CLIENT_SECRET"))
  //   servers.spotify = spotifyServer;
  if (hasKey("GENIUS_ACCESS_TOKEN")) servers.genius = geniusServer;
  // if (hasKey("TICKETMASTER_API_KEY")) servers.events = eventsServer;
  servers.wikipedia = wikipediaServer; // Always available (free endpoints; Enterprise optional)
  servers.bandcamp = bandcampServer; // Always available (no API key required)
  servers.youtube = youtubeServer; // Always available (yt-dlp + mpv)
  servers.radio = radioServer; // Always available (no API key)
  servers.news = newsServer; // Always available (RSS feeds, no API key)
  servers.collection = collectionServer; // Always available (local SQLite)
  servers.playlist = playlistServer; // Always available (local SQLite)
  if (hasTavily(keys) || hasExa(keys)) servers.websearch = webSearchServer;
  if (hasTavily(keys) || hasExa(keys)) servers.influence = influenceServer;
  servers.influencecache = influenceCacheServer; // Always available (local SQLite)
  servers.telegraph = telegraphServer; // Always available (anonymous Telegraph API)
  if (hasKey("TUMBLR_CONSUMER_KEY") && hasKey("TUMBLR_CONSUMER_SECRET"))
    servers.tumblr = tumblrServer;
  if (hasKey("KERNEL_API_KEY")) servers.browser = browserServer;
  if (hasKey("KERNEL_API_KEY")) servers.whosampled = whoSampledServer;

  return servers;
}

export function getAllowedTools(servers: Record<string, any>): string[] {
  return Object.keys(servers).map((name) => `mcp__${name}__*`);
}

export function getServerStatus(keys?: Record<string, string>): { active: string[]; inactive: string[] } {
  const active = Object.keys(getActiveServers(keys));
  const allServers = [
    "musicbrainz", "discogs", "memory", "lastfm",
    "spotify", "genius", "events", "wikipedia", "bandcamp", "youtube",
    "radio", "news", "collection", "playlist", "websearch", "influence", "influencecache", "telegraph", "tumblr", "browser", "whosampled",
  ];
  const inactive = allServers.filter((s) => !active.includes(s));
  return { active, inactive };
}
