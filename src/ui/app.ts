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
import { NowPlayingBar, NowPlayingPoller } from "./now-playing.js";
import {
  isPlayerActive,
  playerControlHandler,
  playTrackHandler,
} from "../servers/youtube.js";
import { collectionStatsHandler } from "../servers/collection.js";
import { playlistListHandler } from "../servers/playlist.js";
import { showKeysPanel } from "./keys-panel.js";
import {
  isFirstRun,
  markOnboardingComplete,
  getMessageCount,
  incrementMessageCount,
  getHintForContext,
} from "../utils/hints.js";
import type { HintContext } from "../utils/hints.js";
import { showOnboarding } from "./onboarding.js";

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
      return input?.location
        ? `Searching Bandcamp for "${input?.query ?? "music"}" in ${input.location}...`
        : `Searching Bandcamp for "${input?.query ?? "music"}"...`;
    case "get_artist_page":
      return "Fetching Bandcamp artist page...";
    case "get_album":
      return "Fetching album details from Bandcamp...";
    case "discover_music":
      return input?.location
        ? `Discovering ${input?.tag ?? "music"} in ${input.location} on Bandcamp...`
        : `Browsing Bandcamp ${input?.tag ?? "music"} releases...`;
    case "get_tag_info":
      return `Looking up Bandcamp tag "${input?.tag ?? ""}"...`;
    case "get_bandcamp_editorial":
      return input?.url
        ? "Reading Bandcamp Daily article..."
        : `Browsing Bandcamp Daily${input?.category ? ` ${input.category}` : ""}...`;
    // YouTube tools
    case "search_tracks":
      return `Searching YouTube for "${input?.query ?? "music"}"...`;
    case "play_track":
      return input?.url ? "Playing track from YouTube..." : `Playing "${input?.query}"...`;
    case "play_playlist":
      return `Playing ${input?.tracks?.length ?? 0} tracks...`;
    case "player_control":
      return input?.action === "now_playing" ? "Checking what's playing..." : `Player: ${input?.action}...`;
    // Radio tools
    case "search_radio":
      return `Searching radio stations for "${input?.query ?? input?.tag ?? "stations"}"...`;
    case "browse_radio":
      return input?.tag
        ? `Browsing ${input.tag} radio stations...`
        : `Browsing radio stations in ${input?.country ?? "the world"}...`;
    case "get_radio_tags":
      return "Loading radio genre tags...";
    case "play_radio":
      return input?.name
        ? `Tuning in to "${input.name}"...`
        : "Starting radio stream...";
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
    // Collection tools
    case "collection_add":
      return `Adding "${input.title}" by ${input.artist} to collection...`;
    case "collection_search":
      return input.query
        ? `Searching collection for "${input.query}"...`
        : "Searching collection...";
    case "collection_update":
      return `Updating record #${input.id}...`;
    case "collection_remove":
      return `Removing record #${input.id} from collection...`;
    case "collection_stats":
      return "Getting collection stats...";
    case "collection_tags":
      return "Fetching collection tags...";
    // Playlist tools
    case "playlist_create":
      return `Creating playlist "${input.name}"...`;
    case "playlist_add_track":
      return `Adding "${input.title}" by ${input.artist} to playlist...`;
    case "playlist_list":
      return "Listing playlists...";
    case "playlist_get":
      return "Loading playlist...";
    case "playlist_remove_track":
      return "Removing track from playlist...";
    case "playlist_export":
      return `Exporting playlist as ${input.format ?? "markdown"}...`;
    case "playlist_delete":
      return "Deleting playlist...";
    // Web Search tools
    case "search_web":
      return `Searching web for "${input?.query ?? "music"}"${input?.provider === "exa" ? " (neural)" : ""}...`;
    case "find_similar":
      return `Finding pages similar to ${input?.url ?? "URL"}...`;
    case "extract_content":
      return `Extracting content from ${input?.urls?.length ?? 1} URL(s)...`;
    // Influence network tools
    case "search_reviews":
      return `Searching for reviews of "${input?.artist ?? "artist"}"${input?.album ? ` — ${input.album}` : ""}...`;
    case "extract_influences":
      return `Extracting artist influences from review...`;
    case "trace_influence_path":
      return `Tracing influence path: ${input?.from_artist ?? "?"} → ${input?.to_artist ?? "?"}...`;
    case "find_bridge_artists":
      return `Finding bridge artists: ${input?.genre_a ?? "?"} ↔ ${input?.genre_b ?? "?"}...`;
    // News / RSS tools
    case "search_music_news":
      return `Searching music news for "${input?.query ?? "..."}"...`;
    case "get_latest_reviews":
      return `Fetching latest reviews${input?.source ? ` from ${input.source}` : ""}...`;
    case "get_news_sources":
      return "Checking news sources...";
    // Memory tools
    case "get_user_context":
      return "Searching memories...";
    case "update_user_memory":
      return "Updating memories...";
    case "remember_about_user":
      return "Remembering...";
    case "list_user_memories":
      return "Loading memories...";
    default:
      return `Using ${bare.replace(/_/g, " ")}...`;
  }
}

/** Friendly display names for MCP server prefixes. */
const SERVER_LABELS: Record<string, string> = {
  musicbrainz: "MusicBrainz",
  discogs: "Discogs",
  genius: "Genius",
  lastfm: "Last.fm",
  wikipedia: "Wikipedia",
  bandcamp: "Bandcamp",
  youtube: "YouTube",
  radio: "Radio",
  news: "News",
  collection: "Collection",
  playlist: "Playlist",
  websearch: "Web",
  influence: "Influence",
  memory: "Memory",
};

/** Extract the server name from a fully-qualified MCP tool name. */
function extractServerName(toolName: string): string | null {
  const match = toolName.match(/^mcp__([^_]+)__/);
  return match ? match[1] ?? null : null;
}

/** Build a multi-source progress string with checkmarks for completed sources. */
function buildProgressMessage(
  completed: Set<string>,
  current: string | null,
  _elapsed: number,
): string {
  const parts: string[] = [];
  for (const server of completed) {
    const label = SERVER_LABELS[server] ?? server;
    parts.push(chalk.green("\u2713") + " " + chalk.dim(label));
  }
  if (current && !completed.has(current)) {
    const label = SERVER_LABELS[current] ?? current;
    parts.push(chalk.cyan("\u280B") + " " + label + "\u2026");
  }
  return parts.join(chalk.dim(" \u00B7 "));
}

async function handleSlashCommand(tui: TUI, agent: CrateAgent, input: string): Promise<void> {
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
    // Player controls
    case "pause":
    case "pp": {
      if (!isPlayerActive()) {
        addChildBeforeEditor(tui, new Text(chalk.dim("No track playing."), 1, 0));
      } else {
        const result = await playerControlHandler({ action: "toggle_pause" });
        const data = JSON.parse(result.content[0].text);
        const icon = data.status === "paused" ? chalk.yellow("▐▐") : chalk.green("▶");
        addChildBeforeEditor(tui, new Text(`${icon} ${chalk.dim(data.status)}`, 1, 0));
      }
      tui.requestRender();
      break;
    }
    case "next": {
      if (!isPlayerActive()) {
        addChildBeforeEditor(tui, new Text(chalk.dim("No track playing."), 1, 0));
      } else {
        await playerControlHandler({ action: "next" });
        addChildBeforeEditor(tui, new Text(chalk.dim("⏭ Next track"), 1, 0));
      }
      tui.requestRender();
      break;
    }
    case "prev": {
      if (!isPlayerActive()) {
        addChildBeforeEditor(tui, new Text(chalk.dim("No track playing."), 1, 0));
      } else {
        await playerControlHandler({ action: "previous" });
        addChildBeforeEditor(tui, new Text(chalk.dim("⏮ Previous track"), 1, 0));
      }
      tui.requestRender();
      break;
    }
    case "stop": {
      if (!isPlayerActive()) {
        addChildBeforeEditor(tui, new Text(chalk.dim("No track playing."), 1, 0));
      } else {
        await playerControlHandler({ action: "stop" });
        addChildBeforeEditor(tui, new Text(chalk.dim("⏹ Stopped"), 1, 0));
      }
      tui.requestRender();
      break;
    }
    case "vol": {
      if (!isPlayerActive()) {
        addChildBeforeEditor(tui, new Text(chalk.dim("No track playing."), 1, 0));
      } else if (arg) {
        const vol = parseInt(arg, 10);
        if (isNaN(vol) || vol < 0 || vol > 150) {
          addChildBeforeEditor(tui, new Text(chalk.yellow("Volume must be 0-150."), 1, 0));
        } else {
          await playerControlHandler({ action: "set_volume", volume: vol });
          addChildBeforeEditor(tui, new Text(chalk.dim(`🔊 Volume: ${vol}`), 1, 0));
        }
      } else {
        const result = await playerControlHandler({ action: "now_playing" });
        const data = JSON.parse(result.content[0].text);
        addChildBeforeEditor(tui, new Text(chalk.dim(`🔊 Volume: ${data.volume ?? "unknown"}`), 1, 0));
      }
      tui.requestRender();
      break;
    }
    case "np": {
      if (!isPlayerActive()) {
        addChildBeforeEditor(tui, new Text(chalk.dim("No track playing."), 1, 0));
      } else {
        const result = await playerControlHandler({ action: "now_playing" });
        const data = JSON.parse(result.content[0].text);
        const icon = data.status === "paused" ? chalk.yellow("▐▐") : chalk.green("▶");
        const title = data.track?.title ?? data.media_title ?? "Unknown";
        const channel = data.track?.channel ? chalk.dim(` · ${data.track.channel}`) : "";
        const time = data.position && data.duration ? chalk.dim(` ${data.position} / ${data.duration}`) : "";
        addChildBeforeEditor(tui, new Text(`${icon} ${title}${channel}${time}`, 1, 0));
      }
      tui.requestRender();
      break;
    }
    case "play": {
      const query = parts.slice(1).join(" ").trim();
      if (!query) {
        addChildBeforeEditor(tui, new Text(chalk.yellow("Usage: /play <song or artist>"), 1, 0));
        tui.requestRender();
        break;
      }
      addChildBeforeEditor(tui, new Text(chalk.dim(`🔍 Searching "${query}"...`), 1, 0));
      tui.requestRender();
      try {
        const result = await playTrackHandler({ query });
        const data = JSON.parse(result.content[0].text);
        if (data.error) {
          addChildBeforeEditor(tui, new Text(chalk.red(`Error: ${data.error}`), 1, 0));
        } else {
          const channel = data.channel ? chalk.dim(` · ${data.channel}`) : "";
          const dur = data.duration ? chalk.dim(` (${data.duration})`) : "";
          addChildBeforeEditor(tui, new Text(`${chalk.green("▶")} ${data.title}${channel}${dur}`, 1, 0));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to play track";
        addChildBeforeEditor(tui, new Text(chalk.red(`Error: ${msg}`), 1, 0));
      }
      tui.requestRender();
      break;
    }
    case "collection": {
      const result = await collectionStatsHandler();
      const data = JSON.parse(result.content[0].text);
      if (data.error) {
        addChildBeforeEditor(tui, new Text(chalk.red(`Error: ${data.error}`), 1, 0));
      } else if (!data.total || data.total === 0) {
        const emptyMsg = [
          chalk.bold("Your collection is empty."),
          "",
          chalk.dim("Start building it:"),
          chalk.dim('  "Add Kind of Blue by Miles Davis, vinyl, 1959"'),
          chalk.dim('  "Add my copy of Madvillainy on Stones Throw"'),
          "",
          chalk.dim("Or import from Discogs \u2014 just ask!"),
        ].join("\n");
        addChildBeforeEditor(tui, new Text(emptyMsg, 1, 1));
      } else {
        const lines = [
          chalk.bold("Collection Stats"),
          `  Total: ${chalk.cyan(String(data.total))}`,
        ];
        if (data.by_status?.length) {
          lines.push("", chalk.bold("  By status:"));
          for (const s of data.by_status as any[]) {
            lines.push(`    ${s.status ?? "unknown"}: ${chalk.cyan(String(s.count))}`);
          }
        }
        if (data.by_format?.length) {
          lines.push("", chalk.bold("  By format:"));
          for (const f of data.by_format as any[]) {
            lines.push(`    ${f.format ?? "unknown"}: ${chalk.cyan(String(f.count))}`);
          }
        }
        if (data.avg_rating !== null && data.avg_rating !== undefined) {
          lines.push("", `  Avg rating: ${chalk.cyan(String(data.avg_rating))}/5`);
        }
        if (data.top_tags?.length) {
          const tags = (data.top_tags as any[]).map((t: any) => t.tag).join(", ");
          lines.push("", `  Top tags: ${chalk.dim(tags)}`);
        }
        addChildBeforeEditor(tui, new Text(lines.join("\n"), 1, 1));
      }
      tui.requestRender();
      break;
    }
    case "playlists": {
      const result = await playlistListHandler();
      const data = JSON.parse(result.content[0].text);
      if (data.error) {
        addChildBeforeEditor(tui, new Text(chalk.red(`Error: ${data.error}`), 1, 0));
      } else if (!data.playlists?.length) {
        const emptyMsg = [
          chalk.bold("No playlists yet."),
          "",
          chalk.dim("Try:"),
          chalk.dim('  "Create a playlist called \'Jazz Essentials\'"'),
          chalk.dim('  "Build me a 10-track intro to Afrobeat"'),
        ].join("\n");
        addChildBeforeEditor(tui, new Text(emptyMsg, 1, 1));
      } else {
        const lines = [chalk.bold("Playlists")];
        for (const p of data.playlists as any[]) {
          const desc = p.description ? chalk.dim(` — ${p.description}`) : "";
          lines.push(`  ${chalk.cyan(`#${p.id}`)} ${p.name} ${chalk.dim(`(${p.track_count} tracks)`)}${desc}`);
        }
        addChildBeforeEditor(tui, new Text(lines.join("\n"), 1, 1));
      }
      tui.requestRender();
      break;
    }
    case "keys": {
      showKeysPanel(tui, agent);
      break;
    }
    case "quit":
    case "exit": {
      if ((agent as any).endSession) {
        try { await (agent as any).endSession(); } catch {}
      }
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

  // Welcome message (onboarding on first run, normal welcome after)
  if (isFirstRun()) {
    showOnboarding(tui);
    markOnboardingComplete();
  } else {
    tui.addChild(new Text(WELCOME_TEXT, 1, 1));
  }

  // Slash command autocomplete
  const slashCommands: SlashCommand[] = [
    // Player
    { name: "play", description: "Play a track (/play <query>)" },
    { name: "pause", description: "Toggle pause/resume" },
    { name: "next", description: "Next track (playlist)" },
    { name: "prev", description: "Previous track (playlist)" },
    { name: "stop", description: "Stop playback" },
    { name: "vol", description: "Set or show volume (/vol [0-150])" },
    { name: "np", description: "Now playing info" },
    // Collection & Playlists
    { name: "collection", description: "Show collection stats" },
    { name: "playlists", description: "List all playlists" },
    // Session
    { name: "help", description: "Show available commands" },
    { name: "model", description: "Show or switch model (sonnet, opus, haiku)" },
    { name: "cost", description: "Show token usage and cost" },
    { name: "clear", description: "Clear the screen" },
    { name: "servers", description: "Show active/inactive servers" },
    { name: "keys", description: "Manage API keys" },
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
      await handleSlashCommand(tui, agent, trimmed);
      return;
    }

    isProcessing = true;
    editor.disableSubmit = true;
    incrementMessageCount();

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

    // Stream agent response — with progress tiers and interrupt support
    const response = new Markdown("", 1, 1, markdownTheme);
    let accumulated = "";
    let loaderRemoved = false;
    const startTime = Date.now();
    const sourcesUsed = new Set<string>();
    const toolsUsed: string[] = [];
    let aborted = false;

    // Interrupt handling — Esc during streaming
    const onEsc = (key: string) => {
      if (key === "escape" && isProcessing) {
        aborted = true;
      }
    };
    if (typeof (tui as any).onKey === "function") {
      (tui as any).onKey(onEsc);
    } else if (typeof (tui as any).on === "function") {
      (tui as any).on("key", onEsc);
    }

    try {
      for await (const msg of agent.chat(trimmed)) {
        if (aborted) break;

        if (msg.type === "assistant") {
          const content = (msg as any).message?.content;
          if (!content) continue;

          for (const block of content) {
            if (aborted) break;

            // Update loader with tool call progress (with elapsed-time tiers)
            if (block.type === "tool_use" && !loaderRemoved) {
              const bare = block.name.replace(/^mcp__[^_]+__/, "");
              toolsUsed.push(bare);
              const serverName = extractServerName(block.name);
              const elapsed = Date.now() - startTime;

              if (elapsed < 3000) {
                // Tier 1: simple message
                const progressMsg = getToolProgressMessage(block.name, block.input ?? {});
                loader.setMessage(progressMsg);
              } else {
                // Tier 2+: source-by-source with checkmarks
                if (serverName) {
                  // Mark previous server as done, current as in-progress
                  const prevServers = [...sourcesUsed];
                  if (serverName && prevServers.length > 0) {
                    // All previously seen servers are "completed"
                  }
                  sourcesUsed.add(serverName);
                  const completed = new Set(
                    [...sourcesUsed].filter((s) => s !== serverName),
                  );
                  loader.setMessage(buildProgressMessage(completed, serverName, elapsed));
                } else {
                  const progressMsg = getToolProgressMessage(block.name, block.input ?? {});
                  loader.setMessage(progressMsg);
                }
              }

              // Always track the server for the footer
              if (serverName) sourcesUsed.add(serverName);
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
        loaderRemoved = true;
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

    // Interrupt notice
    if (aborted) {
      addChildBeforeEditor(
        tui,
        new Text(
          chalk.yellow("\u26A0 Response interrupted \u2014 some sources may not have been checked."),
          1,
          0,
        ),
      );
    }

    // Post-response footer: sources · duration · cost
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const displaySources = [...sourcesUsed]
      .map((s) => SERVER_LABELS[s] ?? s)
      .filter((s) => s !== "Collection" && s !== "Playlist" && s !== "Memory");
    const sourceList = displaySources.length > 0 ? displaySources.join(" \u00B7 ") : "";
    const costStr = `$${agent.cost.toFixed(4)}`;
    const footerParts = [sourceList, `${duration}s`, costStr].filter(Boolean);
    addChildBeforeEditor(
      tui,
      new Text(chalk.dim(footerParts.join("  \u00B7  ")), 1, 0),
    );

    // Contextual hints
    const hasTrackList = /\d+\.\s/.test(accumulated) && /(track|song|album)/i.test(accumulated);
    const hintCtx: HintContext = {
      toolsUsed,
      messageCount: getMessageCount(),
      responseLength: accumulated.length,
      hasTrackList,
      collectionSize: 0, // TODO: could query, but avoid DB hit on every response
      playlistCount: 0,
    };
    const hint = getHintForContext(hintCtx);
    if (hint) {
      addChildBeforeEditor(
        tui,
        new Text(chalk.dim.italic(`\u{1F4A1} ${hint}`), 1, 0),
      );
    }

    isProcessing = false;
    editor.disableSubmit = false;
    tui.requestRender();
  };

  // Graceful Ctrl+C handling
  process.on("SIGINT", () => {
    if (isProcessing) {
      // During streaming, just flag abort — the streaming loop handles cleanup
      return;
    }
    // Not processing — clean exit
    tui.stop();
    process.exit(0);
  });

  // Now-playing bar (polls mpv, auto-shows/hides)
  const nowPlayingBar = new NowPlayingBar();
  const nowPlayingPoller = new NowPlayingPoller(tui, nowPlayingBar);
  nowPlayingPoller.start();

  tui.addChild(editor);
  tui.setFocus(editor);

  return tui;
}
