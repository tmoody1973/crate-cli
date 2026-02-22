import "dotenv/config";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

const KEY_GATED_SERVERS: Record<string, string[]> = {
  memory: ["MEM0_API_KEY"],
  discogs: ["DISCOGS_KEY", "DISCOGS_SECRET"],
  spotify: ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET"],
  lastfm: ["LASTFM_API_KEY"],
  genius: ["GENIUS_ACCESS_TOKEN"],
  events: ["TICKETMASTER_API_KEY"],
  youtube: ["YOUTUBE_API_KEY"],
  "web-search": ["TAVILY_API_KEY", "EXA_API_KEY"],
  // wikipedia: always enabled (free endpoints; Enterprise credentials optional)
};

const AVAILABLE_MODELS: Record<string, string> = {
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-6",
  haiku: "claude-haiku-4-5-20251001",
};

export interface CrateConfig {
  defaultModel: string;
  availableKeys: string[];
  availableModels: Record<string, string>;
  keyGatedServers: Record<string, string[]>;
}

export function getConfig(): CrateConfig {
  const allKeys = Object.values(KEY_GATED_SERVERS).flat();
  const availableKeys = allKeys.filter((key) => !!process.env[key]);

  return {
    defaultModel: DEFAULT_MODEL,
    availableKeys,
    availableModels: AVAILABLE_MODELS,
    keyGatedServers: KEY_GATED_SERVERS,
  };
}

export function resolveModel(alias: string): string {
  return AVAILABLE_MODELS[alias.toLowerCase()] ?? alias;
}
