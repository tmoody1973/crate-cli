// src/ui/app.ts
import {
  TUI,
  ProcessTerminal,
  Editor,
  Markdown,
  Loader,
  Text,
  CombinedAutocompleteProvider,
} from "@mariozechner/pi-tui";
import type { SlashCommand } from "@mariozechner/pi-tui";
import chalk from "chalk";
import { CrateAgent } from "../agent/index.js";
import { markdownTheme, editorTheme, WELCOME_TEXT, HELP_TEXT } from "./components.js";
import { getServerStatus } from "../servers/index.js";

function addChildBeforeEditor(tui: TUI, child: any): void {
  const children = tui.children;
  children.splice(children.length - 1, 0, child);
}

/** Map MCP tool names to friendly progress messages */
function getToolProgressMessage(toolName: string, input: Record<string, any>): string {
  // Strip mcp__<server>__ prefix to get the bare tool name
  const bare = toolName.replace(/^mcp__[^_]+__/, "");

  switch (bare) {
    case "search_artist":
      return `Searching for artist "${input.query}"...`;
    case "get_artist":
      return "Fetching artist details...";
    case "search_release":
      return input.artist
        ? `Searching releases by ${input.artist}...`
        : `Searching for "${input.query}"...`;
    case "get_release":
      return "Fetching release details...";
    case "search_recording":
      return input.artist
        ? `Searching tracks by ${input.artist}...`
        : `Searching for "${input.query}"...`;
    case "get_recording_credits":
      return "Fetching recording credits...";
    // Discogs tools
    case "search_discogs":
      return `Searching Discogs for "${input.query}"...`;
    case "get_artist_discogs":
      return "Fetching Discogs artist profile...";
    case "get_artist_releases":
      return "Fetching artist discography from Discogs...";
    case "get_label":
      return "Fetching label profile from Discogs...";
    case "get_label_releases":
      return "Fetching label catalog from Discogs...";
    case "get_master":
      return "Fetching master release from Discogs...";
    case "get_master_versions":
      return "Fetching release versions from Discogs...";
    case "get_release_full":
      return "Fetching full release details from Discogs...";
    case "get_marketplace_stats":
      return "Fetching marketplace pricing from Discogs...";
    // Genius tools
    case "search_songs":
      return `Searching Genius for "${input.query}"...`;
    case "get_song":
      return "Fetching song details from Genius...";
    case "get_song_annotations":
      return "Fetching song annotations from Genius...";
    case "get_artist_genius":
      return "Fetching artist profile from Genius...";
    case "get_artist_songs_genius":
      return "Fetching artist songs from Genius...";
    case "get_annotation":
      return "Fetching annotation details from Genius...";
    // Wikipedia tools
    case "search_articles":
      return `Searching Wikipedia for "${input.query}"...`;
    case "get_summary":
      return `Getting Wikipedia summary for "${input.title}"...`;
    case "get_article":
      return `Reading full Wikipedia article for "${input.title}"...`;
    // Bandcamp tools
    case "search_bandcamp":
      return `Searching Bandcamp for "${input?.query ?? "music"}"...`;
    case "get_artist_page":
      return "Fetching Bandcamp artist page...";
    case "get_album":
      return "Fetching album details from Bandcamp...";
    case "discover_music":
      return `Browsing Bandcamp ${input?.tag ?? "music"} releases...`;
    case "get_tag_info":
      return `Looking up Bandcamp tag "${input?.tag ?? ""}"...`;
    case "get_bandcamp_editorial":
      return input?.url
        ? "Reading Bandcamp Daily article..."
        : `Browsing Bandcamp Daily${input?.category ? ` ${input.category}` : ""}...`;
    // Last.fm tools
    case "get_artist_info":
      return `Looking up Last.fm stats for "${input.artist}"...`;
    case "get_album_info":
      return `Looking up Last.fm stats for "${input.album}" by ${input.artist}...`;
    case "get_track_info":
      return `Looking up Last.fm stats for "${input.track}" by ${input.artist}...`;
    case "get_similar_artists":
      return `Finding artists similar to "${input.artist}" on Last.fm...`;
    case "get_similar_tracks":
      return `Finding tracks similar to "${input.track}" on Last.fm...`;
    case "get_top_tracks":
      return `Fetching top tracks for "${input.artist}" from Last.fm...`;
    case "get_tag_artists":
      return `Fetching top "${input.tag}" artists from Last.fm...`;
    case "get_geo_top_tracks":
      return `Fetching top tracks in ${input.country} from Last.fm...`;
    default:
      return `Using ${bare.replace(/_/g, " ")}...`;
  }
}

function handleSlashCommand(tui: TUI, agent: CrateAgent, input: string): void {
  const parts = input.slice(1).split(/\s+/);
  const command = parts[0]?.toLowerCase();
  const arg = parts[1];

  switch (command) {
    case "help": {
      addChildBeforeEditor(tui, new Text(HELP_TEXT, 1, 1));
      tui.requestRender();
      break;
    }
    case "model": {
      if (arg) {
        const resolved = agent.switchModel(arg);
        addChildBeforeEditor(
          tui,
          new Text(chalk.dim(`Switched to ${chalk.cyan(resolved)}`), 1, 0),
        );
      } else {
        addChildBeforeEditor(
          tui,
          new Text(
            chalk.dim(`Active model: ${chalk.cyan(agent.activeModel)}`),
            1,
            0,
          ),
        );
      }
      tui.requestRender();
      break;
    }
    case "cost": {
      const cost = agent.cost;
      addChildBeforeEditor(
        tui,
        new Text(chalk.dim(`Session cost: ${chalk.cyan(`$${cost.toFixed(4)}`)}`), 1, 0),
      );
      tui.requestRender();
      break;
    }
    case "clear": {
      const editor = tui.children[tui.children.length - 1];
      tui.clear();
      tui.addChild(editor!);
      tui.requestRender(true);
      break;
    }
    case "servers": {
      const status = getServerStatus();
      const lines = [
        chalk.bold("Active servers:"),
        ...status.active.map((s) => `  ${chalk.green("\u25CF")} ${s}`),
        "",
        chalk.bold("Inactive servers") + chalk.dim(" (missing API keys):"),
        ...status.inactive.map((s) => `  ${chalk.dim("\u25CB")} ${s}`),
      ];
      addChildBeforeEditor(tui, new Text(lines.join("\n"), 1, 1));
      tui.requestRender();
      break;
    }
    case "quit":
    case "exit": {
      tui.stop();
      process.exit(0);
    }
    default: {
      addChildBeforeEditor(
        tui,
        new Text(
          chalk.yellow(`Unknown command: /${command}. Type /help for available commands.`),
          1,
          0,
        ),
      );
      tui.requestRender();
    }
  }
}

export function createApp(agent: CrateAgent): TUI {
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);

  // Welcome message
  tui.addChild(new Text(WELCOME_TEXT, 1, 1));

  // Slash command autocomplete
  const slashCommands: SlashCommand[] = [
    { name: "help", description: "Show available commands" },
    { name: "model", description: "Show or switch model (sonnet, opus, haiku)" },
    { name: "cost", description: "Show token usage and cost" },
    { name: "clear", description: "Clear the screen" },
    { name: "servers", description: "Show active/inactive servers" },
    { name: "quit", description: "Exit Crate" },
  ];

  const autocomplete = new CombinedAutocompleteProvider(slashCommands, process.cwd());

  const editor = new Editor(tui, editorTheme);
  editor.setAutocompleteProvider(autocomplete);

  let isProcessing = false;

  editor.onSubmit = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isProcessing) return;

    // Handle slash commands locally
    if (trimmed.startsWith("/")) {
      handleSlashCommand(tui, agent, trimmed);
      return;
    }

    isProcessing = true;
    editor.disableSubmit = true;

    // Show user message
    addChildBeforeEditor(
      tui,
      new Text(chalk.bold.white("> ") + trimmed, 1, 0),
    );

    // Show loader while agent works
    const loader = new Loader(
      tui,
      (s: string) => chalk.cyan(s),
      (s: string) => chalk.dim(s),
      "Researching...",
    );
    addChildBeforeEditor(tui, loader);
    tui.requestRender();

    // Stream agent response
    const response = new Markdown("", 1, 1, markdownTheme);
    let accumulated = "";
    let loaderRemoved = false;

    try {
      for await (const msg of agent.chat(trimmed)) {
        if (msg.type === "assistant") {
          const content = (msg as any).message?.content;
          if (!content) continue;

          for (const block of content) {
            // Update loader with tool call progress
            if (block.type === "tool_use" && !loaderRemoved) {
              const progressMsg = getToolProgressMessage(block.name, block.input ?? {});
              loader.setMessage(progressMsg);
            }

            if (block.type === "text" && block.text) {
              if (!loaderRemoved) {
                tui.removeChild(loader);
                addChildBeforeEditor(tui, response);
                loaderRemoved = true;
              }
              accumulated += block.text;
              response.setText(accumulated);
              tui.requestRender();
            }
          }
        }
      }
    } catch (error) {
      if (!loaderRemoved) {
        tui.removeChild(loader);
      }
      const message =
        error instanceof Error ? error.message : "An unexpected error occurred";
      addChildBeforeEditor(
        tui,
        new Text(chalk.red(`Error: ${message}`), 1, 0),
      );
    }

    if (!loaderRemoved) {
      tui.removeChild(loader);
    }

    isProcessing = false;
    editor.disableSubmit = false;
    tui.requestRender();
  };

  tui.addChild(editor);
  tui.setFocus(editor);

  return tui;
}
