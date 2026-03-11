import "dotenv/config";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

const KEY_GATED_SERVERS: Record<string, string[]> = {
  memory: ["MEM0_API_KEY"],
  discogs: ["DISCOGS_KEY", "DISCOGS_SECRET"],
  spotify: ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET"],
  lastfm: ["LASTFM_API_KEY"],
  genius: ["GENIUS_ACCESS_TOKEN"],
  ticketmaster: ["TICKETMASTER_API_KEY"],
  youtube: ["YOUTUBE_API_KEY"],
  "web-search": ["TAVILY_API_KEY", "EXA_API_KEY"],
  tumblr: ["TUMBLR_CONSUMER_KEY", "TUMBLR_CONSUMER_SECRET"],
  browser: ["KERNEL_API_KEY"],
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

/* ── Two-tier key architecture ─────────────────────────────────── */

const EMBEDDED_KEYS: Record<string, Record<string, string>> = {
  ticketmaster: { TICKETMASTER_API_KEY: "PLACEHOLDER_TICKETMASTER_KEY" },
  lastfm: { LASTFM_API_KEY: "PLACEHOLDER_LASTFM_KEY" },
  discogs: { DISCOGS_KEY: "PLACEHOLDER_DISCOGS_KEY", DISCOGS_SECRET: "PLACEHOLDER_DISCOGS_SECRET" },
};

// Reverse lookup: env var name → embedded value
const EMBEDDED_KEY_LOOKUP: Record<string, string> = {};
for (const keys of Object.values(EMBEDDED_KEYS)) {
  for (const [envVar, value] of Object.entries(keys)) {
    EMBEDDED_KEY_LOOKUP[envVar] = value;
  }
}

/** Resolve an API key: user env var wins, embedded default as fallback. */
export function resolveKey(envVar: string): string | undefined {
  return process.env[envVar] || EMBEDDED_KEY_LOOKUP[envVar] || undefined;
}

/** Check if a service is using its embedded default key (no user override). */
export function isUsingEmbeddedKey(service: string): boolean {
  const serviceKeys = EMBEDDED_KEYS[service];
  if (!serviceKeys) return false;
  return Object.keys(serviceKeys).every((k) => !process.env[k]);
}
