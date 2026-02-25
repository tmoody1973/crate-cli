// src/ui/onboarding.ts — Multi-step onboarding wizard overlay
import { SettingsList, Input, Text, TUI } from "@mariozechner/pi-tui";
import type { SettingItem, SettingsListTheme, Component } from "@mariozechner/pi-tui";
import chalk from "chalk";
import { getServerStatus } from "../servers/index.js";
import { writeEnvKey, getEnvPath } from "../utils/env.js";
import { markOnboardingComplete } from "../utils/hints.js";

const BANNER = [
  ` \u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557`,
  `\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u255A\u2550\u2550\u2588\u2588\u2554\u2550\u2550\u255D\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D`,
  `\u2588\u2588\u2551     \u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551   \u2588\u2588\u2551   \u2588\u2588\u2588\u2588\u2588\u2557  `,
  `\u2588\u2588\u2551     \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551   \u2588\u2588\u2551   \u2588\u2588\u2554\u2550\u2550\u255D  `,
  `\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551   \u2588\u2588\u2551   \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557`,
  ` \u255A\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D   \u255A\u2550\u255D   \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D`,
]
  .map((line) => chalk.bold.hex("#E86A47")(line))
  .join("\n");

interface WizardKeyEntry {
  envVar: string;
  label: string;
  description: string;
  signupUrl: string;
  required?: boolean;
}

const WIZARD_KEYS: WizardKeyEntry[] = [
  // Required
  {
    envVar: "ANTHROPIC_API_KEY",
    label: "Anthropic API Key",
    description: "Required \u2014 powers the AI agent",
    signupUrl: "https://console.anthropic.com/",
    required: true,
  },
  // Recommended
  {
    envVar: "LASTFM_API_KEY",
    label: "Last.fm API Key",
    description: "Listening stats, similar artists, tags",
    signupUrl: "https://www.last.fm/api/account/create",
  },
  {
    envVar: "GENIUS_ACCESS_TOKEN",
    label: "Genius Token",
    description: "Song lyrics, annotations, artist bios",
    signupUrl: "https://genius.com/api-clients",
  },
  {
    envVar: "TAVILY_API_KEY",
    label: "Tavily API Key",
    description: "Web search for influence tracing & scene discovery",
    signupUrl: "https://tavily.com/",
  },
  // Publishing
  {
    envVar: "TUMBLR_CONSUMER_KEY",
    label: "Tumblr Consumer Key",
    description: "Publish research to your Tumblr blog",
    signupUrl: "https://www.tumblr.com/oauth/apps",
  },
  {
    envVar: "TUMBLR_CONSUMER_SECRET",
    label: "Tumblr Consumer Secret",
    description: "Publish research to your Tumblr blog",
    signupUrl: "https://www.tumblr.com/oauth/apps",
  },
];

function buildServerStatusDots(): string {
  const status = getServerStatus();
  const labels: Record<string, string> = {
    musicbrainz: "MusicBrainz",
    bandcamp: "Bandcamp",
    wikipedia: "Wikipedia",
    youtube: "YouTube",
    radio: "Radio",
    news: "News",
    discogs: "Discogs",
    lastfm: "Last.fm",
    genius: "Genius",
    websearch: "Web Search",
    influence: "Influence",
    telegraph: "Telegraph",
    tumblr: "Tumblr",
    collection: "Collection",
    playlist: "Playlist",
    memory: "Memory",
  };

  const dots: string[] = [];
  for (const [key, label] of Object.entries(labels)) {
    if (status.active.includes(key)) {
      dots.push(`${chalk.green("\u25CF")} ${label}`);
    } else {
      dots.push(`${chalk.dim("\u25CB")} ${label}`);
    }
  }

  const rows: string[] = [];
  for (let i = 0; i < dots.length; i += 4) {
    rows.push("  " + dots.slice(i, i + 4).join("   "));
  }
  return rows.join("\n");
}

const wizardTheme: SettingsListTheme = {
  label: (text, selected) => selected ? chalk.bold.white(text) : chalk.white(text),
  value: (text, selected) => selected ? chalk.cyan(text) : chalk.dim(text),
  description: (text) => chalk.dim(text),
  cursor: chalk.cyan("\u25B6"),
  hint: (text) => chalk.dim(text),
};

export interface OnboardingResult {
  anthropicKeySet: boolean;
}

/**
 * Show the onboarding wizard as an overlay.
 * @param tui - The TUI instance
 * @param needsAnthropicKey - Whether the Anthropic key is missing (true = required step shown)
 * @param onComplete - Callback when wizard finishes; receives whether Anthropic key was set
 */
export function showOnboarding(
  tui: TUI,
  needsAnthropicKey: boolean,
  onComplete: (result: OnboardingResult) => void,
): void {
  const envPath = getEnvPath();
  let anthropicKeySet = !needsAnthropicKey; // Already set if not needed

  // Build items for the wizard
  const items: SettingItem[] = [];

  // ── Welcome header (non-interactive, just shows banner) ──
  items.push({
    id: "__welcome",
    label: chalk.bold("Welcome to Crate"),
    description: "AI-powered deep music research agent. Let's get you set up.",
    currentValue: "Press Enter to start \u2193",
    submenu: (_val: string, done: (val?: string) => void) => {
      const welcomeText = new Text(
        [
          BANNER,
          "",
          chalk.bold.white("  Welcome to Crate"),
          chalk.dim("  AI-powered deep music research agent"),
          "",
          chalk.dim("  This wizard will help you configure your API keys."),
          chalk.dim("  You only need an Anthropic key to get started \u2014"),
          chalk.dim("  everything else is optional and can be added later with /keys."),
          "",
          chalk.dim.italic("  Press Escape to continue."),
        ].join("\n"),
        1,
        1,
      );
      // Escape returns to list
      (welcomeText as any).onEscape = () => done("Ready \u2713");
      (welcomeText as any).handleInput = (key: string) => {
        if (key === "escape" || key === "return") done("Ready \u2713");
      };
      return welcomeText as Component;
    },
  });

  // ── Anthropic API Key (required, shown if missing) ──
  if (needsAnthropicKey) {
    const currentAnthropicKey = process.env.ANTHROPIC_API_KEY ?? "";
    items.push({
      id: "ANTHROPIC_API_KEY",
      label: chalk.bold("\u2605 Anthropic API Key") + chalk.red(" (required)"),
      description: `Powers the AI agent  ${chalk.dim.underline("https://console.anthropic.com/")}`,
      currentValue: currentAnthropicKey ? maskKey(currentAnthropicKey) : chalk.red("not set"),
      submenu: (_val: string, done: (val?: string) => void) => {
        const input = new Input();
        input.setValue(currentAnthropicKey);
        input.onSubmit = (newValue: string) => {
          const trimmed = newValue.trim();
          if (trimmed) {
            writeEnvKey(envPath, "ANTHROPIC_API_KEY", trimmed);
            process.env.ANTHROPIC_API_KEY = trimmed;
            anthropicKeySet = true;
            done(maskKey(trimmed));
          } else {
            done(); // Can't skip required key — just go back
          }
        };
        input.onEscape = () => done();
        return input;
      },
    });
  }

  // ── Recommended Keys section header ──
  items.push({
    id: "__recommended_header",
    label: chalk.bold("Recommended Keys") + chalk.dim(" (optional)"),
    description: "Unlock more sources. Press Enter to expand, Escape to skip.",
    currentValue: "",
  });

  // ── Recommended keys ──
  for (const entry of WIZARD_KEYS.filter((k) => !k.required && !k.envVar.startsWith("TUMBLR"))) {
    const current = process.env[entry.envVar] ?? "";
    items.push({
      id: entry.envVar,
      label: `  ${entry.label}`,
      description: `${entry.description}  ${chalk.dim.underline(entry.signupUrl)}`,
      currentValue: current ? maskKey(current) : chalk.dim("not set"),
      submenu: (_val: string, done: (val?: string) => void) => {
        const input = new Input();
        input.setValue(current);
        input.onSubmit = (newValue: string) => {
          const trimmed = newValue.trim();
          if (trimmed) {
            writeEnvKey(envPath, entry.envVar, trimmed);
            process.env[entry.envVar] = trimmed;
            done(maskKey(trimmed));
          } else {
            done();
          }
        };
        input.onEscape = () => done();
        return input;
      },
    });
  }

  // ── Publishing section header ──
  items.push({
    id: "__publishing_header",
    label: chalk.bold("Publishing") + chalk.dim(" (optional)"),
    description: `Telegraph works out of the box \u2014 no key needed. Tumblr requires app registration.`,
    currentValue: "",
  });

  // ── Tumblr keys ──
  for (const entry of WIZARD_KEYS.filter((k) => k.envVar.startsWith("TUMBLR"))) {
    const current = process.env[entry.envVar] ?? "";
    items.push({
      id: entry.envVar,
      label: `  ${entry.label}`,
      description: `${entry.description}  ${chalk.dim.underline(entry.signupUrl)}`,
      currentValue: current ? maskKey(current) : chalk.dim("not set"),
      submenu: (_val: string, done: (val?: string) => void) => {
        const input = new Input();
        input.setValue(current);
        input.onSubmit = (newValue: string) => {
          const trimmed = newValue.trim();
          if (trimmed) {
            writeEnvKey(envPath, entry.envVar, trimmed);
            process.env[entry.envVar] = trimmed;
            done(maskKey(trimmed));
          } else {
            done();
          }
        };
        input.onEscape = () => done();
        return input;
      },
    });
  }

  // ── Finish ──
  items.push({
    id: "__finish",
    label: chalk.bold.green("Finish Setup"),
    description: "You can add or change keys anytime with /keys.",
    currentValue: "Press Enter to start digging \u2192",
    submenu: (_val: string, done: (val?: string) => void) => {
      const statusText = new Text(
        [
          chalk.bold.white("  Server Status"),
          "",
          buildServerStatusDots(),
          "",
          chalk.dim("  You can add more keys anytime with /keys."),
          "",
          chalk.dim.italic("  Press Escape to start using Crate."),
        ].join("\n"),
        1,
        1,
      );
      (statusText as any).onEscape = () => done("Done");
      (statusText as any).handleInput = (key: string) => {
        if (key === "escape" || key === "return") done("Done");
      };
      return statusText as Component;
    },
  });

  const settingsList = new SettingsList(
    items,
    12,
    wizardTheme,
    (id: string, _newValue: string) => {
      // If user selected Finish, close wizard
      if (id === "__finish") {
        markOnboardingComplete();
        tui.hideOverlay();
        onComplete({ anthropicKeySet });
      }
    },
    () => {
      // onCancel (Escape from top level) — finish if Anthropic key is set
      if (anthropicKeySet) {
        markOnboardingComplete();
        tui.hideOverlay();
        onComplete({ anthropicKeySet });
      }
      // If Anthropic key not set, don't allow canceling — stay in wizard
    },
  );

  tui.showOverlay(settingsList, {
    width: "85%",
    maxHeight: "80%",
    anchor: "center",
  });
}

function maskKey(value: string): string {
  if (!value) return chalk.dim("not set");
  if (value.length <= 12) return "****";
  return `${value.slice(0, 6)}...${value.slice(-3)}`;
}
