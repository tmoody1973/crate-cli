// src/ui/components.ts
import chalk from "chalk";
import type { MarkdownTheme, EditorTheme } from "@mariozechner/pi-tui";

export const markdownTheme: MarkdownTheme = {
  heading: (s: string) => chalk.bold.cyan(s),
  link: (s: string) => chalk.blue(s),
  linkUrl: (s: string) => chalk.dim(s),
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

export const WELCOME_TEXT = `${chalk.bold.cyan("Crate")} ${chalk.dim("v0.1.0")} — Music research agent

${chalk.dim("Type a question to start researching. Use /help for commands.")}
${chalk.dim("Press Enter to send, Escape to cancel.")}`;

export const HELP_TEXT = `${chalk.bold.cyan("Commands")}

${chalk.bold("Research")}
  ${chalk.dim("Just type naturally — ask about artists, albums, credits, scenes.")}

${chalk.bold("Session")}
  ${chalk.cyan("/model")}${chalk.dim(" [name]")}  Show or switch model (sonnet, opus, haiku)
  ${chalk.cyan("/cost")}           Show token usage and cost
  ${chalk.cyan("/clear")}          Clear the screen
  ${chalk.cyan("/help")}           Show this help
  ${chalk.cyan("/quit")}           Exit Crate`;
