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
${chalk.dim("MusicBrainz · Discogs · Genius · Wikipedia · Influence · +5")}

${chalk.dim(DESCRIPTION)}

${chalk.dim("Type a question to start researching. Use /help for commands.")}`;

export const HELP_TEXT = `${chalk.bold.cyan("Crate \u2014 Music Research Agent")}

${chalk.bold("Research")}
  Just ask naturally \u2014 Crate searches MusicBrainz, Discogs, Genius,
  Wikipedia, Last.fm, Bandcamp, and the web to answer your questions.
  Ask for live radio stations to stream 30,000+ stations worldwide.

${chalk.bold("Player")}
  ${chalk.cyan("/play")}${chalk.dim(" <query>")}   Play a track from YouTube
  ${chalk.cyan("/pause")}           Toggle pause/resume
  ${chalk.cyan("/next")}            Next track (playlist)
  ${chalk.cyan("/prev")}            Previous track (playlist)
  ${chalk.cyan("/stop")}            Stop playback
  ${chalk.cyan("/vol")}${chalk.dim(" [0-150]")}    Set or show volume
  ${chalk.cyan("/np")}              Now playing info

${chalk.bold("Library")}
  ${chalk.cyan("/collection")}      Collection stats
  ${chalk.cyan("/playlists")}       List playlists

${chalk.bold("Social")}
  ${chalk.cyan("/mypage")}          Your Crate page URL & recent entries
  ${chalk.cyan("/entries")}${chalk.dim(" [cat]")}   List published entries (filter by category)

${chalk.bold("Session")}
  ${chalk.cyan("/model")}${chalk.dim(" [name]")}   Switch model (sonnet, opus, haiku)
  ${chalk.cyan("/cost")}            Token usage and cost
  ${chalk.cyan("/servers")}         Active/inactive servers
  ${chalk.cyan("/keys")}            Manage API keys
  ${chalk.cyan("/clear")} \u00B7 ${chalk.cyan("/help")} \u00B7 ${chalk.cyan("/quit")}`;

// ── Error formatting ───────────────────────────────────────────────────────

export type ErrorType = "api_down" | "rate_limit" | "missing_key" | "bad_query";

export interface ErrorDetails {
  source?: string;
  message?: string;
  keyCommand?: string;
}

/** Format an error using the What \u2192 Impact \u2192 Action pattern. */
export function formatError(type: ErrorType, details: ErrorDetails = {}): string {
  const { source, message, keyCommand } = details;
  const src = source ? ` (${source})` : "";

  switch (type) {
    case "api_down":
      return [
        chalk.red(`\u2716 ${source ?? "Service"} is unavailable`),
        chalk.dim(message ?? "The API did not respond."),
        chalk.dim("Crate will use other sources. Try again later for this one."),
      ].join("\n");

    case "rate_limit":
      return [
        chalk.yellow(`\u26A0 Rate limited${src}`),
        chalk.dim("Too many requests in a short time."),
        chalk.dim("Wait a moment and try again, or continue \u2014 other sources still work."),
      ].join("\n");

    case "missing_key":
      return [
        chalk.yellow(`\u26A0 ${source ?? "Service"} requires an API key`),
        chalk.dim(`This source is unavailable without a key.`),
        chalk.dim(keyCommand ? `Run ${chalk.cyan(keyCommand)} to add it.` : "Use /keys to add API keys."),
      ].join("\n");

    case "bad_query":
      return [
        chalk.yellow(`\u26A0 Couldn't understand that query`),
        chalk.dim(message ?? "Try rephrasing your question."),
        chalk.dim('Example: "Who produced Madvillainy?" or "Tell me about Stones Throw Records"'),
      ].join("\n");

    default:
      return chalk.red(message ?? "An unexpected error occurred.");
  }
}
