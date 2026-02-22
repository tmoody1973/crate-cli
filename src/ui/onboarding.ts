// src/ui/onboarding.ts
import type { TUI } from "@mariozechner/pi-tui";
import { Text } from "@mariozechner/pi-tui";
import chalk from "chalk";
import { getServerStatus } from "../servers/index.js";

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

function buildOnboardingText(): string {
  const status = getServerStatus();

  // Build status dots: active = green filled, inactive = dim hollow
  const allServerLabels: Record<string, string> = {
    musicbrainz: "MusicBrainz",
    bandcamp: "Bandcamp",
    wikipedia: "Wikipedia",
    youtube: "YouTube",
    discogs: "Discogs",
    lastfm: "Last.fm",
    genius: "Genius",
    "web-search": "Web Search",
  };

  const dots: string[] = [];
  for (const [key, label] of Object.entries(allServerLabels)) {
    if (status.active.includes(key)) {
      dots.push(`${chalk.green("\u25CF")} ${label}`);
    } else {
      dots.push(`${chalk.dim("\u25CB")} ${label}`);
    }
  }

  // Arrange dots in rows of 4
  const dotRows: string[] = [];
  for (let i = 0; i < dots.length; i += 4) {
    dotRows.push("    " + dots.slice(i, i + 4).join("    "));
  }

  const sep = chalk.dim("\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");

  return `${BANNER}
${sep}
${chalk.bold.white("deep music research agent")}${chalk.dim("                          v0.5.0")}

  ${chalk.bold("API Status:")}
${dotRows.join("\n")}
    ${chalk.dim("Use /keys to add API keys for more sources.")}

  ${chalk.bold("Try asking:")}
    ${chalk.dim('"Who produced Madvillainy?"')}
    ${chalk.dim('"Find me jazz records sampled in 90s hip-hop"')}
    ${chalk.dim('"What\'s the Detroit techno scene look like on Bandcamp?"')}

  ${chalk.dim("/help \u00B7 /cost \u00B7 /quit")}`;
}

export function showOnboarding(tui: TUI): void {
  const text = buildOnboardingText();
  tui.addChild(new Text(text, 1, 1));
}
