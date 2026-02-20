// src/servers/index.ts
import { musicbrainzServer } from "./musicbrainz.js";
import { discogsServer } from "./discogs.js";
import { geniusServer } from "./genius.js";
import { lastfmServer } from "./lastfm.js";
import { wikipediaServer } from "./wikipedia.js";

export function getActiveServers(): Record<string, any> {
  const servers: Record<string, any> = {
    musicbrainz: musicbrainzServer,
  };

  // Key-gated servers:
  if (process.env.DISCOGS_KEY && process.env.DISCOGS_SECRET)
    servers.discogs = discogsServer;
  // if (process.env.MEM0_API_KEY) servers.memory = memoryServer;
  if (process.env.LASTFM_API_KEY) servers.lastfm = lastfmServer;
  // if (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET)
  //   servers.spotify = spotifyServer;
  if (process.env.GENIUS_ACCESS_TOKEN) servers.genius = geniusServer;
  // if (process.env.TICKETMASTER_API_KEY) servers.events = eventsServer;
  servers.wikipedia = wikipediaServer; // Always available (free endpoints; Enterprise optional)

  return servers;
}

export function getAllowedTools(servers: Record<string, any>): string[] {
  return Object.keys(servers).map((name) => `mcp__${name}__*`);
}

export function getServerStatus(): { active: string[]; inactive: string[] } {
  const active = Object.keys(getActiveServers());
  const allServers = [
    "musicbrainz", "discogs", "memory", "lastfm",
    "spotify", "genius", "events", "wikipedia",
  ];
  const inactive = allServers.filter((s) => !active.includes(s));
  return { active, inactive };
}
