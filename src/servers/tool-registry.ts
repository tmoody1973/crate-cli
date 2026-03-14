// src/servers/tool-registry.ts
import type { SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import { musicbrainzTools } from "./musicbrainz.js";
import { discogsTools } from "./discogs.js";
import { geniusTools } from "./genius.js";
import { lastfmTools } from "./lastfm.js";
import { wikipediaTools } from "./wikipedia.js";
import { bandcampTools } from "./bandcamp.js";
import { youtubeTools } from "./youtube.js";
import { collectionTools } from "./collection.js";
import { playlistTools } from "./playlist.js";
import { memoryTools } from "./memory.js";
import { radioTools } from "./radio.js";
import { newsTools } from "./news.js";
import { webSearchTools, hasTavily, hasExa } from "./web-search.js";
import { influenceTools } from "./influence.js";
import { influenceCacheTools } from "./influence-cache.js";
import { telegraphTools } from "./telegraph.js";
import { tumblrTools } from "./tumblr.js";
import { browserTools } from "./browser.js";
import { whoSampledTools } from "./whosampled.js";
import { ticketmasterTools } from "./ticketmaster.js";
import { itunesTools } from "./itunes.js";
import { resolveKey } from "../utils/config.js";

export interface ToolGroup {
  serverName: string;
  tools: SdkMcpToolDefinition<any>[];
}

export function getActiveTools(): ToolGroup[] {
  const active: ToolGroup[] = [];
  const hasKey = (envVar: string): boolean => !!resolveKey(envVar);

  // Always available
  active.push({ serverName: "musicbrainz", tools: musicbrainzTools });
  active.push({ serverName: "wikipedia", tools: wikipediaTools });
  active.push({ serverName: "bandcamp", tools: bandcampTools });
  active.push({ serverName: "youtube", tools: youtubeTools });
  active.push({ serverName: "radio", tools: radioTools });
  active.push({ serverName: "news", tools: newsTools });
  active.push({ serverName: "collection", tools: collectionTools });
  active.push({ serverName: "playlist", tools: playlistTools });
  active.push({ serverName: "influencecache", tools: influenceCacheTools });
  active.push({ serverName: "telegraph", tools: telegraphTools });
  active.push({ serverName: "itunes", tools: itunesTools });
  if (hasKey("TICKETMASTER_API_KEY"))
    active.push({ serverName: "ticketmaster", tools: ticketmasterTools });

  // Key-gated
  if (hasKey("DISCOGS_KEY") && hasKey("DISCOGS_SECRET"))
    active.push({ serverName: "discogs", tools: discogsTools });
  if (hasKey("MEM0_API_KEY"))
    active.push({ serverName: "memory", tools: memoryTools });
  if (hasKey("LASTFM_API_KEY"))
    active.push({ serverName: "lastfm", tools: lastfmTools });
  if (hasKey("GENIUS_ACCESS_TOKEN"))
    active.push({ serverName: "genius", tools: geniusTools });
  if (hasTavily() || hasExa()) {
    active.push({ serverName: "websearch", tools: webSearchTools });
    active.push({ serverName: "influence", tools: influenceTools });
  }
  if (hasKey("TUMBLR_CONSUMER_KEY") && hasKey("TUMBLR_CONSUMER_SECRET"))
    active.push({ serverName: "tumblr", tools: tumblrTools });
  if (hasKey("KERNEL_API_KEY")) {
    active.push({ serverName: "browser", tools: browserTools });
    active.push({ serverName: "whosampled", tools: whoSampledTools });
  }

  return active;
}
