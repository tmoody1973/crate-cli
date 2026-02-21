// src/ui/now-playing.ts
/**
 * Now-playing bar — persistent bottom overlay showing mpv playback status.
 *
 * Visual (100 cols):
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *  ▶ Karma Police · Radiohead          ━━━━━━━━━━━━━━━━━━━━━━━●──────────── 3:12 / 4:21  vol:85
 */

import type { Component, TUI } from "@mariozechner/pi-tui";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import chalk from "chalk";
import {
  isPlayerActive,
  getCurrentTrack,
  isPlaylistMode,
  getPlayerProperty,
  setOnPlayerStopped,
} from "../servers/youtube.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface NowPlayingState {
  active: boolean;
  title: string;
  channel: string;
  paused: boolean;
  position: number; // seconds
  duration: number; // seconds
  volume: number; // 0-150
  isPlaylist: boolean;
  playlistPos?: number;
  playlistCount?: number;
}

const EMPTY_STATE: NowPlayingState = {
  active: false,
  title: "",
  channel: "",
  paused: false,
  position: 0,
  duration: 0,
  volume: 100,
  isPlaylist: false,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function applyBg(line: string, width: number, bgFn: (s: string) => string): string {
  const pad = Math.max(0, width - visibleWidth(line));
  return bgFn(line + " ".repeat(pad));
}

// ---------------------------------------------------------------------------
// NowPlayingBar Component
// ---------------------------------------------------------------------------

export class NowPlayingBar implements Component {
  private state: NowPlayingState = { ...EMPTY_STATE };

  setState(state: NowPlayingState): void {
    this.state = state;
  }

  invalidate(): void {
    // No cached state to clear
  }

  render(width: number): string[] {
    const s = this.state;
    if (!s.active) return [];

    const bg = (t: string) => chalk.bgHex("#1a1a2e")(t);

    // Line 1: dim separator
    const sep = applyBg(chalk.dim("─".repeat(width)), width, bg);

    // Line 2: content
    const icon = s.paused
      ? chalk.yellow("▐▐")
      : chalk.green("▶");

    // Title · Channel
    let label = s.title;
    if (s.channel) label += chalk.dim(" · ") + chalk.dim(s.channel);

    // Playlist indicator
    if (s.isPlaylist && s.playlistPos != null && s.playlistCount != null) {
      label += chalk.dim(` [${s.playlistPos}/${s.playlistCount}]`);
    }

    // Time
    const timeStr = `${formatTime(s.position)} / ${formatTime(s.duration)}`;

    // Volume (hide on narrow terminals)
    const showVolume = width >= 80;
    const volStr = showVolume ? chalk.dim(` vol:${Math.round(s.volume)}`) : "";

    // Progress bar — calculate available space
    // Layout: " {icon} {label} {bar} {time}{vol} "
    const fixedWidth =
      1 + // leading space
      visibleWidth(icon) +
      1 + // space after icon
      1 + // space before bar
      1 + // space after bar
      visibleWidth(timeStr) +
      visibleWidth(volStr) +
      1; // trailing space

    const maxLabelWidth = Math.min(
      Math.floor(width * 0.4),
      width - fixedWidth - 10, // at least 10 cols for bar
    );

    const truncLabel = truncateToWidth(label, Math.max(maxLabelWidth, 8), "…");
    const labelWidth = visibleWidth(truncLabel);

    const barSpace = width - fixedWidth - labelWidth;

    let bar = "";
    if (barSpace >= 5 && s.duration > 0) {
      const pct = Math.min(s.position / s.duration, 1);
      const filled = Math.round(pct * (barSpace - 1)); // -1 for knob
      const empty = barSpace - 1 - filled;
      bar =
        chalk.cyan("━".repeat(filled)) +
        chalk.white("●") +
        chalk.dim("─".repeat(Math.max(empty, 0)));
    } else if (barSpace >= 5) {
      bar = chalk.dim("─".repeat(barSpace));
    }

    const content =
      ` ${icon} ${truncLabel} ${bar} ${timeStr}${volStr} `;

    return [sep, applyBg(content, width, bg)];
  }
}

// ---------------------------------------------------------------------------
// NowPlayingPoller
// ---------------------------------------------------------------------------

export class NowPlayingPoller {
  private tui: TUI;
  private component: NowPlayingBar;
  private interval: ReturnType<typeof setInterval> | null = null;
  private active = false;
  private polling = false;

  constructor(tui: TUI, component: NowPlayingBar) {
    this.tui = tui;
    this.component = component;
  }

  start(): void {
    // Create overlay once — `visible` callback controls rendering without stealing focus
    this.tui.showOverlay(this.component, {
      anchor: "bottom-center",
      width: "100%",
      visible: () => this.active,
    });

    // Register immediate-hide callback for when mpv dies
    setOnPlayerStopped(() => {
      this.active = false;
      this.tui.requestRender();
    });

    this.interval = setInterval(() => {
      void this.poll();
    }, 1000);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.active = false;
    this.tui.requestRender();
  }

  dispose(): void {
    this.stop();
    setOnPlayerStopped(null);
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;

    try {
      if (!isPlayerActive()) {
        if (this.active) {
          this.active = false;
          this.tui.requestRender();
        }
        return;
      }

      // Fetch all properties in parallel, each with individual error handling
      const [timePos, duration, paused, volume, mediaTitle, playlistPos, playlistCount] =
        await Promise.all([
          getPlayerProperty("time-pos").catch(() => undefined),
          getPlayerProperty("duration").catch(() => undefined),
          getPlayerProperty("pause").catch(() => undefined),
          getPlayerProperty("volume").catch(() => undefined),
          getPlayerProperty("media-title").catch(() => undefined),
          getPlayerProperty("playlist-pos").catch(() => undefined),
          getPlayerProperty("playlist-count").catch(() => undefined),
        ]);

      // Don't show until we have at least position data
      if (timePos == null && duration == null) return;

      const track = getCurrentTrack();
      const title = (mediaTitle as string) ?? track?.title ?? "Unknown";
      const channel = track?.channel ?? "";

      const state: NowPlayingState = {
        active: true,
        title,
        channel,
        paused: (paused as boolean) ?? false,
        position: typeof timePos === "number" ? timePos : 0,
        duration: typeof duration === "number" ? duration : 0,
        volume: typeof volume === "number" ? volume : 100,
        isPlaylist: isPlaylistMode(),
        ...(typeof playlistPos === "number" && {
          playlistPos: playlistPos + 1, // mpv is 0-indexed
        }),
        ...(typeof playlistCount === "number" && { playlistCount }),
      };

      this.active = true;
      this.component.setState(state);
      this.tui.requestRender();
    } finally {
      this.polling = false;
    }
  }
}
