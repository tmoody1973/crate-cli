// src/ui/components.ts
import chalk from "chalk";
import type { MarkdownTheme, EditorTheme } from "@mariozechner/pi-tui";

/**
 * Wrap visible text in an OSC 8 clickable hyperlink sequence.
 * Supported by iTerm2, Kitty, WezTerm, Windows Terminal, GNOME Terminal 3.26+.
 * Unsupported terminals silently ignore the sequences.
 */
function osc8(url: string, text: string): string {
  return `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`;
}

/**
 * Extract a raw URL from a string that may contain ANSI codes and
 * parenthetical wrapping like " (https://example.com)".
 */
function extractUrl(s: string): string {
  const stripped = s.replace(/\x1b\[[0-9;]*m/g, "");
  const match = stripped.match(/\bhttps?:\/\/[^\s)]+/);
  return match ? match[0] : "";
}

export const markdownTheme: MarkdownTheme = {
  heading: (s: string) => chalk.bold.cyan(s),
  // pi-tui calls link() for the visible link text. When text == href (bare URLs),
  // this is the only function called, so we wrap it in OSC 8 for clickability.
  // The underline styling is already applied by pi-tui before calling this.
  link: (s: string) => {
    // Try to extract a URL from the styled text (for bare-URL links where text == href)
    const url = extractUrl(s);
    return url ? osc8(url, chalk.blue(s)) : chalk.blue(s);
  },
  // pi-tui calls linkUrl() for the " (url)" suffix when link text differs from href.
  // Receives " (https://...)" — we make the URL portion clickable via OSC 8.
  linkUrl: (s: string) => {
    const url = extractUrl(s);
    return url ? osc8(url, chalk.dim(s)) : chalk.dim(s);
  },
  code: (s: string) => chalk.yellow(s),
  codeBlock: (s: string) => chalk.gray(s),
  codeBlockBorder: (s: string) => chalk.dim(s),
  quote: (s: string) => chalk.italic.dim(s),
  quoteBorder: (s: string) => chalk.dim(s),
  hr: (s: string) => chalk.dim(s),
  listBullet: (s: string) => chalk.cyan(s),
  bold: (s: string) => chalk.bold(s),
  italic: (s: string) => chalk.italic(s),
  strikethrough: (s: string) => chalk.strikethrough(s),
  underline: (s: string) => chalk.underline(s),
};

export const editorTheme: EditorTheme = {
  borderColor: (s: string) => chalk.dim(s),
  selectList: {
    selectedPrefix: (s: string) => chalk.cyan(s),
    selectedText: (s: string) => chalk.white(s),
    description: (s: string) => chalk.dim(s),
    scrollInfo: (s: string) => chalk.dim(s),
    noMatch: (s: string) => chalk.dim(s),
  },
};

const BANNER = [
  ` ██████╗██████╗  █████╗ ████████╗███████╗`,
  `██╔════╝██╔══██╗██╔══██╗╚══██╔══╝██╔════╝`,
  `██║     ██████╔╝███████║   ██║   █████╗  `,
  `██║     ██╔══██╗██╔══██║   ██║   ██╔══╝  `,
  `╚██████╗██║  ██║██║  ██║   ██║   ███████╗`,
  ` ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚══════╝`,
]
  .map((line) => chalk.bold.hex("#E86A47")(line))
  .join("\n");

const SEPARATOR = chalk.dim("───────────────────────────────────────────");

const DESCRIPTION = `Crate is an AI-powered music research agent for DJs, collectors, and serious listeners. Ask about any artist, album, label, or recording and Crate will dig through multiple databases to surface credits, pressings, pricing, and connections you won't find in one place.`;

export const WELCOME_TEXT = `${BANNER}
${SEPARATOR}
${chalk.bold.white("deep music research agent")}${chalk.dim("                          v0.5.0")}
${chalk.dim("MusicBrainz · Discogs · Genius · Wikipedia · +5")}

${chalk.dim(DESCRIPTION)}

${chalk.dim("Type a question to start researching. Use /help for commands.")}`;

export const HELP_TEXT = `${chalk.bold.cyan("Crate — Music Research Agent")}

${chalk.bold("How to use")}
  ${chalk.dim("Type naturally to research music. Crate searches MusicBrainz, Discogs,")}
  ${chalk.dim("Genius, Wikipedia, Last.fm, Bandcamp, and YouTube to answer your questions.")}

  ${chalk.dim("Examples:")}
  ${chalk.dim("  \"Who produced Madvillainy?\"")}
  ${chalk.dim("  \"Tell me about the label Stones Throw\"")}
  ${chalk.dim("  \"Find similar artists to MF DOOM\"")}
  ${chalk.dim("  \"Play some J Dilla instrumentals\"")}

${chalk.bold("Player")}
  ${chalk.cyan("/play")}${chalk.dim(" <query>")}   Play a track from YouTube
  ${chalk.cyan("/pause")}           Toggle pause/resume
  ${chalk.cyan("/next")}            Next track (playlist)
  ${chalk.cyan("/prev")}            Previous track (playlist)
  ${chalk.cyan("/stop")}            Stop playback
  ${chalk.cyan("/vol")}${chalk.dim(" [0-150]")}    Set or show volume
  ${chalk.cyan("/np")}              Now playing info

${chalk.bold("Session")}
  ${chalk.cyan("/model")}${chalk.dim(" [name]")}   Show or switch model (sonnet, opus, haiku)
  ${chalk.cyan("/cost")}            Show token usage and cost
  ${chalk.cyan("/servers")}         Show active/inactive servers
  ${chalk.cyan("/clear")}           Clear the screen
  ${chalk.cyan("/help")}            Show this help
  ${chalk.cyan("/quit")}            Exit Crate`;
