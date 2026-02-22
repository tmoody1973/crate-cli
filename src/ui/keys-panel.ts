// src/ui/keys-panel.ts — Interactive API key management panel
import { SettingsList, Input, Text, TUI } from "@mariozechner/pi-tui";
import type { SettingItem, SettingsListTheme, Component } from "@mariozechner/pi-tui";
import chalk from "chalk";
import { CrateAgent } from "../agent/index.js";
import { readEnvFile, writeEnvKey, deleteEnvKey, getEnvPath } from "../utils/env.js";

interface KeyEntry {
  envVar: string;
  server: string;
  label: string;
  description: string;
  signupUrl: string;
}

const API_KEY_REGISTRY: KeyEntry[] = [
  // Core
  { envVar: "ANTHROPIC_API_KEY", server: "core", label: "Anthropic API Key", description: "Required — powers the AI agent", signupUrl: "https://console.anthropic.com/" },
  // Discogs
  { envVar: "DISCOGS_KEY", server: "discogs", label: "Discogs Key", description: "Required for vinyl/label catalog data", signupUrl: "https://www.discogs.com/settings/developers" },
  { envVar: "DISCOGS_SECRET", server: "discogs", label: "Discogs Secret", description: "Required for vinyl/label catalog data", signupUrl: "https://www.discogs.com/settings/developers" },
  // Genius
  { envVar: "GENIUS_ACCESS_TOKEN", server: "genius", label: "Genius Token", description: "Song lyrics, annotations, artist bios", signupUrl: "https://genius.com/api-clients" },
  // Last.fm
  { envVar: "LASTFM_API_KEY", server: "lastfm", label: "Last.fm API Key", description: "Listening stats, similar artists, tags", signupUrl: "https://www.last.fm/api/account/create" },
  // Web Search
  { envVar: "TAVILY_API_KEY", server: "web-search", label: "Tavily API Key", description: "Web search for local scene discovery", signupUrl: "https://tavily.com/" },
  { envVar: "EXA_API_KEY", server: "web-search", label: "Exa API Key", description: "Neural/semantic web search", signupUrl: "https://exa.ai/" },
  // Memory
  { envVar: "MEM0_API_KEY", server: "memory", label: "Mem0 API Key", description: "Persistent memory across sessions", signupUrl: "https://app.mem0.ai/" },
  // YouTube
  { envVar: "YOUTUBE_API_KEY", server: "youtube", label: "YouTube API Key", description: "Improved search results (optional — works without)", signupUrl: "https://console.cloud.google.com/apis/credentials" },
  // Events
  { envVar: "TICKETMASTER_API_KEY", server: "events", label: "Ticketmaster Key", description: "Live event and concert discovery", signupUrl: "https://developer.ticketmaster.com/" },
];

/** Mask an API key for display: show first 6 + last 3 chars for keys > 12 chars. */
function maskKey(value: string): string {
  if (!value) return chalk.dim("not set");
  if (value.length <= 12) return "****";
  return `${value.slice(0, 6)}...${value.slice(-3)}`;
}

/** Get the current value of an env var from both process.env and .env file. */
function getCurrentValue(envVar: string): string {
  return process.env[envVar] ?? "";
}

const keysTheme: SettingsListTheme = {
  label: (text, selected) => selected ? chalk.bold.white(text) : chalk.white(text),
  value: (text, selected) => selected ? chalk.cyan(text) : chalk.dim(text),
  description: (text) => chalk.dim(text),
  cursor: chalk.cyan("\u25B6"),
  hint: (text) => chalk.dim(text),
};

/** Show the interactive API key management overlay. */
export function showKeysPanel(tui: TUI, agent: CrateAgent): void {
  const envPath = getEnvPath();

  function buildItems(): SettingItem[] {
    return API_KEY_REGISTRY.map((entry) => {
      const current = getCurrentValue(entry.envVar);
      return {
        id: entry.envVar,
        label: entry.label,
        description: `${entry.description}  ${chalk.dim.underline(entry.signupUrl)}`,
        currentValue: maskKey(current),
        submenu: (_currentValue: string, done: (selectedValue?: string) => void): Component => {
          const input = new Input();
          // Pre-fill with current value so user can see/edit it
          input.setValue(current);
          input.onSubmit = (newValue: string) => {
            const trimmed = newValue.trim();
            if (trimmed) {
              // Write to .env and update process.env
              writeEnvKey(envPath, entry.envVar, trimmed);
              process.env[entry.envVar] = trimmed;
            } else {
              // Empty value = delete the key
              deleteEnvKey(envPath, entry.envVar);
              delete process.env[entry.envVar];
            }
            // Hot-reload servers
            agent.reloadServers();
            done(maskKey(trimmed));
          };
          input.onEscape = () => done();
          return input;
        },
      };
    });
  }

  const items = buildItems();

  const settingsList = new SettingsList(
    items,
    14,
    keysTheme,
    (_id: string, _newValue: string) => {
      // onChange — already handled in submenu onSubmit
    },
    () => {
      // onCancel — close overlay
      tui.hideOverlay();
    },
  );

  tui.showOverlay(settingsList, {
    width: "80%",
    maxHeight: "70%",
    anchor: "center",
  });
}
