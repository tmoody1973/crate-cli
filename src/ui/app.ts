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
import type { CrateEvent } from "../agent/events.js";
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
import {
  viewMyPageHandler,
  listEntriesHandler,
} from "../servers/telegraph.js";
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
import type { OnboardingResult } from "./onboarding.js";

export interface AppOptions {
  model?: string;
}

function addChildBeforeEditor(tui: TUI, child: { render(width: number): string[]; invalidate(): void }): void {
  const children = tui.children;
  // Insert before the NowPlayingBar and Editor (last two children)
  children.splice(children.length - 2, 0, child);
}

/** Map MCP tool names to friendly progress messages */
function getToolProgressMessage(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
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
    case "search_articles":
      return `Searching Wikipedia for "${input.query}"...`;
    case "get_summary":
      return `Getting Wikipedia summary for "${input.title}"...`;
    case "get_article":
      return `Reading full Wikipedia article for "${input.title}"...`;
    case "search_bandcamp":
      return input?.location
        ? `Searching Bandcamp for "${input?.query ?? "music"}" in ${input.location}...`
        : `Searching Bandcamp for "${input?.query ?? "music"}"...`;
    case "get_artist_page":
      return "Fetching Bandcamp artist page...";
    case "get_album":
      return "Fetching album details from Bandcamp...";
    case "get_artist_tracks":
      return `Finding tracks for "${input?.artist ?? "artist"}" on Bandcamp...`;
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
    case "search_tracks":
      return `Searching YouTube for "${input?.query ?? "music"}"...`;
    case "play_track":
      return input?.url ? "Playing track from YouTube..." : `Playing "${input?.query}"...`;
    case "play_playlist":
      return `Playing ${(input?.tracks as unknown[])?.length ?? 0} tracks...`;
    case "player_control":
      return input?.action === "now_playing" ? "Checking what's playing..." : `Player: ${input?.action}...`;
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
    case "search_web":
      return `Searching web for "${input?.query ?? "music"}"${input?.provider === "exa" ? " (neural)" : ""}...`;
    case "find_similar":
      return `Finding pages similar to ${input?.url ?? "URL"}...`;
    case "extract_content":
      return `Extracting content from ${(input?.urls as unknown[])?.length ?? 1} URL(s)...`;
    case "search_reviews":
      return `Searching music publications for "${input?.artist ?? "artist"}"${input?.album ? ` — ${input.album}` : ""}...`;
    case "extract_influences":
      return `Extracting co-mentions & influence signals from review text...`;
    case "trace_influence_path":
      return `Tracing influence path: ${input?.from_artist ?? "?"} → ${input?.to_artist ?? "?"}...`;
    case "find_bridge_artists":
      return `Finding bridge artists: ${input?.genre_a ?? "?"} ↔ ${input?.genre_b ?? "?"}...`;
    case "cache_influence":
      return `Caching: ${input?.from_artist ?? "?"} → ${input?.to_artist ?? "?"}...`;
    case "cache_batch_influences":
      return `Caching ${(input?.edges as unknown[])?.length ?? 0} influence edges...`;
    case "lookup_influences":
      return `Looking up cached influences for "${input?.artist ?? "?"}"...`;
    case "find_cached_path":
      return `Finding cached path: ${input?.from_artist ?? "?"} → ${input?.to_artist ?? "?"}...`;
    case "search_cached_artists":
      return `Searching cached artists for "${input?.query ?? "?"}"...`;
    case "influence_graph_stats":
      return "Getting influence graph stats...";
    case "add_artist_alias":
      return `Adding alias: "${input?.alias ?? "?"}" → "${input?.artist_name ?? "?"}"...`;
    case "remove_cached_edge":
      return `Removing cached edge #${input?.edge_id ?? "?"}...`;
    case "search_music_news":
      return `Searching music news for "${input?.query ?? "..."}"...`;
    case "get_latest_reviews":
      return `Fetching latest reviews${input?.source ? ` from ${input.source}` : ""}...`;
    case "get_news_sources":
      return "Checking news sources...";
    case "get_user_context":
      return "Searching memories...";
    case "update_user_memory":
      return "Updating memories...";
    case "remember_about_user":
      return "Remembering...";
    case "list_user_memories":
      return "Loading memories...";
    case "connect_tumblr":
      return "Connecting to Tumblr...";
    case "post_to_tumblr":
      return "Publishing to Tumblr...";
    case "tumblr_blog_info":
      return "Fetching Tumblr blog info...";
    case "disconnect_tumblr":
      return "Disconnecting Tumblr...";
    case "tumblr_status":
      return "Checking Tumblr status...";
    case "setup_page":
      return "Setting up your Crate social page...";
    case "post_to_page":
      return "Publishing to your Crate page...";
    case "view_my_page":
      return "Fetching your Crate page info...";
    case "list_entries":
      return "Loading your published entries...";
    case "delete_entry":
      return "Removing entry from your page...";
    case "browse_url": {
      try {
        const host = input.url ? new URL(input.url as string).hostname : "page";
        return `Reading ${host}...`;
      } catch {
        return "Reading page...";
      }
    }
    case "screenshot_url": {
      try {
        const host = input.url ? new URL(input.url as string).hostname : "page";
        return `Capturing screenshot of ${host}...`;
      } catch {
        return "Capturing screenshot...";
      }
    }
    case "search_whosampled":
      return `Searching WhoSampled for "${input.artist} - ${input.track}"...`;
    case "get_track_samples":
      return "Fetching sample connections from WhoSampled...";
    case "get_artist_connections":
      return `Loading ${input.artist ?? "artist"}'s sample history on WhoSampled...`;
    default:
      return `Using ${toolName.replace(/_/g, " ")}...`;
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
  influencecache: "Cache",
  memory: "Memory",
  telegraph: "Telegraph",
  tumblr: "Tumblr",
  browser: "Browser",
  whosampled: "WhoSampled",
};

/** Build a multi-source progress string with checkmarks for completed sources. */
function buildProgressMessage(
  completed: Set<string>,
  current: string | null,
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

/** Influence sub-step messages — shown while multi-step influence tools run */
const INFLUENCE_SUBSTEPS: Record<string, string[]> = {
  trace_influence_path: [
    "Searching for direct connection...",
    "Scanning both artists' neighborhoods...",
    "Extracting co-mentions from reviews...",
    "Looking for bridge artists...",
    "Scoring connection strength...",
  ],
  find_bridge_artists: [
    "Searching crossover artists...",
    "Scanning genre A publications...",
    "Scanning genre B publications...",
    "Extracting artist mentions...",
    "Scoring bridge candidates...",
  ],
  search_reviews: [
    "Querying music publications...",
    "Extracting full review text...",
    "Parsing review content...",
  ],
  extract_influences: [
    "Parsing review text...",
    "Detecting co-mentions...",
    "Scoring influence signals...",
  ],
};

async function handleSlashCommand(tui: TUI, agent: CrateAgent | null, input: string): Promise<string | void> {
  const parts = input.slice(1).split(/\s+/);
  const command = parts[0]?.toLowerCase();
  const arg = parts[1];

  // Commands that work without an agent
  const noAgentCommands = new Set(["help", "clear", "servers", "quit", "exit",
    "pause", "pp", "next", "prev", "stop", "vol", "np", "play",
    "collection", "playlists", "mypage", "entries"]);

  if (!agent && command && !noAgentCommands.has(command)) {
    addChildBeforeEditor(
      tui,
      new Text(chalk.yellow("Complete setup first — enter your Anthropic API key in the wizard."), 1, 0),
    );
    tui.requestRender();
    return;
  }

  switch (command) {
    case "help": {
      addChildBeforeEditor(tui, new Text(HELP_TEXT, 1, 1));
      tui.requestRender();
      break;
    }
    case "model": {
      if (arg) {
        const resolved = agent!.switchModel(arg);
        addChildBeforeEditor(
          tui,
          new Text(chalk.dim(`Switched to ${chalk.cyan(resolved)}`), 1, 0),
        );
      } else {
        addChildBeforeEditor(
          tui,
          new Text(
            chalk.dim(`Active model: ${chalk.cyan(agent!.activeModel)}`),
            1,
            0,
          ),
        );
      }
      tui.requestRender();
      break;
    }
    case "cost": {
      const cost = agent!.cost;
      addChildBeforeEditor(
        tui,
        new Text(chalk.dim(`Session cost: ${chalk.cyan(`$${cost.toFixed(4)}`)}`), 1, 0),
      );
      tui.requestRender();
      break;
    }
    case "clear": {
      const npBar = tui.children[tui.children.length - 2];
      const editor = tui.children[tui.children.length - 1];
      tui.clear();
      tui.addChild(npBar!);
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
      const playQuery = parts.slice(1).join(" ").trim();
      if (!playQuery) {
        addChildBeforeEditor(tui, new Text(chalk.yellow("Usage: /play <song or artist>"), 1, 0));
        tui.requestRender();
        break;
      }
      addChildBeforeEditor(tui, new Text(chalk.dim(`🔍 Searching "${playQuery}"...`), 1, 0));
      tui.requestRender();
      try {
        const result = await playTrackHandler({ query: playQuery });
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
          for (const s of data.by_status as Array<{ status?: string; count: number }>) {
            lines.push(`    ${s.status ?? "unknown"}: ${chalk.cyan(String(s.count))}`);
          }
        }
        if (data.by_format?.length) {
          lines.push("", chalk.bold("  By format:"));
          for (const f of data.by_format as Array<{ format?: string; count: number }>) {
            lines.push(`    ${f.format ?? "unknown"}: ${chalk.cyan(String(f.count))}`);
          }
        }
        if (data.avg_rating !== null && data.avg_rating !== undefined) {
          lines.push("", `  Avg rating: ${chalk.cyan(String(data.avg_rating))}/5`);
        }
        if (data.top_tags?.length) {
          const tags = (data.top_tags as Array<{ tag: string }>).map((t) => t.tag).join(", ");
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
        for (const p of data.playlists as Array<{ id: number; name: string; track_count: number; description?: string }>) {
          const desc = p.description ? chalk.dim(` — ${p.description}`) : "";
          lines.push(`  ${chalk.cyan(`#${p.id}`)} ${p.name} ${chalk.dim(`(${p.track_count} tracks)`)}${desc}`);
        }
        addChildBeforeEditor(tui, new Text(lines.join("\n"), 1, 1));
      }
      tui.requestRender();
      break;
    }
    case "mypage": {
      try {
        const result = await viewMyPageHandler({} as Record<string, never>);
        const data = JSON.parse(result.content[0].text);
        if (data.status === "not_setup") {
          const msg = [
            chalk.bold("No Crate page set up yet."),
            "",
            chalk.dim("Ask the agent:"),
            chalk.dim('  "Set up my Crate page"'),
            chalk.dim('  "Set up my Crate page as DJ Maya"'),
          ].join("\n");
          addChildBeforeEditor(tui, new Text(msg, 1, 1));
        } else {
          const lines = [
            chalk.bold("Your Crate Page"),
            `  URL: ${chalk.cyan(data.url)}`,
            `  Author: ${chalk.dim(data.author_name)}`,
            `  Entries: ${chalk.cyan(String(data.total_entries))}`,
          ];
          if (data.recent_entries?.length) {
            lines.push("", chalk.bold("  Recent:"));
            for (const e of data.recent_entries as Array<{ title: string; category?: string; created_at?: string }>) {
              const cat = e.category ? chalk.dim(` [${e.category}]`) : "";
              const date = e.created_at ? chalk.dim(` · ${e.created_at.slice(0, 10)}`) : "";
              lines.push(`    ${e.title}${cat}${date}`);
            }
          }
          addChildBeforeEditor(tui, new Text(lines.join("\n"), 1, 1));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to fetch page info";
        addChildBeforeEditor(tui, new Text(chalk.red(`Error: ${msg}`), 1, 0));
      }
      tui.requestRender();
      break;
    }
    case "entries": {
      try {
        const category = arg || undefined;
        const result = await listEntriesHandler({ category, limit: 20 });
        const data = JSON.parse(result.content[0].text);
        if (data.error) {
          addChildBeforeEditor(tui, new Text(chalk.red(`Error: ${data.error}`), 1, 0));
        } else if (!data.entries?.length) {
          const emptyMsg = [
            chalk.bold("No entries yet."),
            "",
            chalk.dim("Post your first entry:"),
            chalk.dim('  "Post my Pharoah Sanders influence chain to my page"'),
            chalk.dim('  "Publish a deep dive on Susumu Yokota"'),
          ].join("\n");
          addChildBeforeEditor(tui, new Text(emptyMsg, 1, 1));
        } else {
          const heading = category
            ? `Published Entries [${category}]`
            : "Published Entries";
          const lines = [chalk.bold(heading)];
          for (const e of data.entries as Array<{ id: number; title: string; category?: string; created_at?: string; url: string }>) {
            const cat = e.category ? chalk.dim(` [${e.category}]`) : "";
            const date = e.created_at ? chalk.dim(` · ${e.created_at.slice(0, 10)}`) : "";
            lines.push(`  ${chalk.cyan(`#${e.id}`)} ${e.title}${cat}${date}`);
            lines.push(`    ${chalk.dim(e.url)}`);
          }
          lines.push("", chalk.dim(`${data.count} entries total`));
          addChildBeforeEditor(tui, new Text(lines.join("\n"), 1, 1));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to list entries";
        addChildBeforeEditor(tui, new Text(chalk.red(`Error: ${msg}`), 1, 0));
      }
      tui.requestRender();
      break;
    }
    case "news": {
      const count = arg ? Math.min(Math.max(parseInt(arg, 10) || 5, 1), 5) : 5;
      const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
      const day = days[new Date().getDay()];

      return [
        `Generate a Radio Milwaukee daily music news segment for ${day}.`,
        `Find ${count} current music stories from TODAY or the past 24-48 hours.`,
        ``,
        `RESEARCH STEPS:`,
        `1. Use search_music_news to scan RSS feeds for breaking stories`,
        `2. Use search_web (Tavily, topic="news", time_range="day") to find additional breaking music news not in RSS`,
        `3. Use search_web (Exa) for any trending music stories or scene coverage the keyword search missed`,
        `4. Cross-reference and pick the ${count} most compelling, newsworthy stories`,
        `5. For each story, verify facts using available tools (MusicBrainz, Discogs, Bandcamp, etc.)`,
        ``,
        `FORMAT — follow the Music News Segment Format rules in your instructions exactly.`,
        `Output "For ${day}:" then ${count} numbered stories with source citations.`,
      ].join("\n");
    }
    case "keys": {
      showKeysPanel(tui, agent!);
      break;
    }
    case "quit":
    case "exit": {
      if (agent?.endSession) {
        try { await agent.endSession(); } catch { /* ignore */ }
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

/** Handle the CrateEvent stream from agent.research() and render to the TUI. */
async function handleResearchStream(
  tui: TUI,
  events: AsyncGenerator<CrateEvent>,
  loader: Loader,
  loaderInserted: boolean,
): Promise<{ accumulated: string; toolsUsed: string[]; sourcesUsed: Set<string>; aborted: boolean }> {
  const response = new Markdown("", 1, 1, markdownTheme);
  let accumulated = "";
  let loaderRemoved = false;
  const sourcesUsed = new Set<string>();
  const toolsUsed: string[] = [];
  const queryStartTime = Date.now();
  let aborted = false;

  // Influence sub-step ticker state
  let activeInfluenceTool: string | null = null;
  let influenceToolInput: Record<string, unknown> = {};
  let elapsedTicks = 0;
  const thinkingPhrases = ["Thinking...", "Reasoning...", "Working on it..."];

  const elapsedTimer = setInterval(() => {
    elapsedTicks++;
    if (loaderRemoved) return;

    if (activeInfluenceTool && INFLUENCE_SUBSTEPS[activeInfluenceTool]) {
      const steps = INFLUENCE_SUBSTEPS[activeInfluenceTool]!;
      const stepIdx = Math.min(elapsedTicks - 1, steps.length - 1);
      const step = steps[stepIdx]!;
      const stepNum = Math.min(elapsedTicks, steps.length);
      const header =
        activeInfluenceTool === "trace_influence_path"
          ? `${influenceToolInput.from_artist ?? "?"} → ${influenceToolInput.to_artist ?? "?"}`
          : activeInfluenceTool === "find_bridge_artists"
            ? `${influenceToolInput.genre_a ?? "?"} ↔ ${influenceToolInput.genre_b ?? "?"}`
            : activeInfluenceTool === "search_reviews"
              ? `${influenceToolInput.artist ?? "artist"}`
              : "Influence analysis";
      loader.setMessage(
        `${header}  ${chalk.dim(`step ${stepNum}/${steps.length}:`)} ${step} ${chalk.dim(`(${elapsedTicks}s)`)}`,
      );
    } else {
      const phrase = thinkingPhrases[Math.min(elapsedTicks - 1, thinkingPhrases.length - 1)]!;
      loader.setMessage(`${phrase} ${chalk.dim(`(${elapsedTicks}s)`)}`);
    }
  }, 1000);

  const stopLoader = () => {
    clearInterval(elapsedTimer);
    loader.stop();
  };

  const removeLoader = () => {
    if (!loaderRemoved) {
      stopLoader();
      tui.removeChild(loader);
      loaderRemoved = true;
    }
  };

  try {
    for await (const event of events) {
      if (aborted) break;

      switch (event.type) {
        case "thinking": {
          // Thinking events are internal — no UI rendering needed
          break;
        }

        case "tool_start": {
          const bare = event.tool;
          if (!toolsUsed.includes(bare)) toolsUsed.push(bare);
          sourcesUsed.add(event.server);

          // Track influence tool for sub-step ticker
          if (INFLUENCE_SUBSTEPS[bare]) {
            activeInfluenceTool = bare;
            influenceToolInput = (event.input ?? {}) as Record<string, unknown>;
            elapsedTicks = 0;
          } else {
            activeInfluenceTool = null;
            influenceToolInput = {};
          }

          if (!loaderRemoved) {
            const elapsed = Date.now() - queryStartTime;
            if (elapsed < 3000) {
              // Tier 1: simple message
              const progressMsg = getToolProgressMessage(bare, (event.input ?? {}) as Record<string, unknown>);
              loader.setMessage(progressMsg);
            } else {
              // Tier 2+: source-by-source with checkmarks
              const completed = new Set(
                [...sourcesUsed].filter((s) => s !== event.server),
              );
              loader.setMessage(buildProgressMessage(completed, event.server));
            }
          }
          break;
        }

        case "tool_end": {
          // If tool took >10s, show a note (only if loader is still visible)
          if (!loaderRemoved && event.durationMs > 10000) {
            const label = SERVER_LABELS[event.server] ?? event.server;
            loader.setMessage(
              `${chalk.green("\u2713")} ${label} · ${event.tool} ${chalk.dim(`(${(event.durationMs / 1000).toFixed(1)}s — slow)`)}`,
            );
          }
          break;
        }

        case "answer_start": {
          // Switch from loader to markdown response
          removeLoader();
          addChildBeforeEditor(tui, response);
          tui.requestRender();
          break;
        }

        case "answer_token": {
          if (!loaderRemoved) {
            removeLoader();
            addChildBeforeEditor(tui, response);
          }
          accumulated += event.token;
          response.setText(accumulated);
          tui.requestRender();
          break;
        }

        case "error": {
          removeLoader();
          addChildBeforeEditor(
            tui,
            new Text(chalk.red(`Error: ${event.message}`), 1, 0),
          );
          tui.requestRender();
          break;
        }

        case "done": {
          // Done event handled after loop
          break;
        }

        case "plan": {
          // Task planning display (Improvement 4 placeholder — render plan tasks)
          if (!loaderRemoved) {
            const planLines = event.tasks
              .map((t) => `  ${chalk.dim("○")} ${t.description}`)
              .join("\n");
            addChildBeforeEditor(
              tui,
              new Text(chalk.bold("Research plan:") + "\n" + planLines, 1, 1),
            );
            tui.requestRender();
          }
          break;
        }
      }
    }
  } catch (err) {
    removeLoader();
    const message = err instanceof Error ? err.message : "An unexpected error occurred";
    addChildBeforeEditor(
      tui,
      new Text(chalk.red(`Error: ${message}`), 1, 0),
    );
  }

  removeLoader();

  return { accumulated, toolsUsed, sourcesUsed, aborted };
}

export function createApp(agent: CrateAgent | null, options?: AppOptions): TUI {
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);

  // Mutable agent ref — wizard can set this after the user enters their key
  let currentAgent = agent;

  const needsAnthropicKey = !process.env.ANTHROPIC_API_KEY;

  // Welcome message (onboarding on first run or missing key, normal welcome after)
  if (isFirstRun() || needsAnthropicKey) {
    showOnboarding(tui, needsAnthropicKey, (result: OnboardingResult) => {
      if (result.anthropicKeySet && !currentAgent) {
        currentAgent = new CrateAgent(options?.model);
      }
      if (currentAgent) {
        currentAgent.reloadServers();
      }
      addChildBeforeEditor(tui, new Text(WELCOME_TEXT, 1, 1));
      tui.requestRender();
    });
  } else {
    tui.addChild(new Text(WELCOME_TEXT, 1, 1));
  }

  // Slash command autocomplete
  const slashCommands: SlashCommand[] = [
    { name: "play", description: "Play a track (/play <query>)" },
    { name: "pause", description: "Toggle pause/resume" },
    { name: "next", description: "Next track (playlist)" },
    { name: "prev", description: "Previous track (playlist)" },
    { name: "stop", description: "Stop playback" },
    { name: "vol", description: "Set or show volume (/vol [0-150])" },
    { name: "np", description: "Now playing info" },
    { name: "collection", description: "Show collection stats" },
    { name: "playlists", description: "List all playlists" },
    { name: "mypage", description: "Your Crate social page URL & recent entries" },
    { name: "entries", description: "List published entries (/entries [category])" },
    { name: "news", description: "Generate daily music news segment (/news [count])" },
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
    let effectivePrompt: string;
    let displayText: string;
    if (trimmed.startsWith("/")) {
      const result = await handleSlashCommand(tui, currentAgent, trimmed);
      if (typeof result !== "string") return;
      effectivePrompt = result;
      displayText = trimmed;
    } else {
      effectivePrompt = trimmed;
      displayText = trimmed;
    }

    // Guard: agent must exist before chatting
    if (!currentAgent) {
      addChildBeforeEditor(
        tui,
        new Text(chalk.yellow("Complete setup first — enter your Anthropic API key in the wizard."), 1, 0),
      );
      tui.requestRender();
      return;
    }

    isProcessing = true;
    editor.disableSubmit = true;
    incrementMessageCount();

    // Show user message
    addChildBeforeEditor(
      tui,
      new Text(chalk.bold.white("> ") + displayText, 1, 0),
    );

    // Show loader while agent works
    const loader = new Loader(
      tui,
      (s: string) => chalk.cyan(s),
      (s: string) => chalk.dim(s),
      "Thinking...",
    );
    addChildBeforeEditor(tui, loader);
    tui.requestRender();

    const startTime = Date.now();

    // Stream typed events from agent.research()
    const events = currentAgent.research(effectivePrompt);
    const { accumulated, toolsUsed, sourcesUsed, aborted } = await handleResearchStream(
      tui, events, loader, true,
    );

    // Interrupt notice
    if (aborted) {
      addChildBeforeEditor(
        tui,
        new Text(
          chalk.yellow("\u26A0 Response interrupted — some sources may not have been checked."),
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
    const costStr = `$${currentAgent.cost.toFixed(4)}`;
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
      collectionSize: 0,
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
    if (isProcessing) return;
    tui.stop();
    process.exit(0);
  });

  // Now-playing bar
  const nowPlayingBar = new NowPlayingBar();
  const nowPlayingPoller = new NowPlayingPoller(tui, nowPlayingBar);
  tui.addChild(nowPlayingBar);
  tui.addChild(editor);
  tui.setFocus(editor);
  nowPlayingPoller.start();

  return tui;
}
