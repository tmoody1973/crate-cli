// src/utils/player.ts
/**
 * Shared mpv player infrastructure — used by YouTube, Radio, and any future
 * audio servers. Manages a singleton mpv subprocess with IPC control.
 */

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createConnection, type Socket } from "node:net";
import { unlinkSync } from "node:fs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MPV_SOCKET = "/tmp/crate-mpv-socket";
export const IPC_TIMEOUT_MS = 3000;
export const SOCKET_WAIT_MS = 1500;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export type ToolResult = { content: [{ type: "text"; text: string }] };

export function toolResult(data: unknown): ToolResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export function toolError(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }] };
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Binary Detection
// ---------------------------------------------------------------------------

export function checkBinary(name: string): string | null {
  try {
    return execFileSync("which", [name], { encoding: "utf-8" }).trim() || null;
  } catch {
    return null;
  }
}

export function requireBinary(name: string): string {
  const path = checkBinary(name);
  if (!path) {
    throw new Error(
      `${name} is not installed. Install it with: brew install ${name}`,
    );
  }
  return path;
}

// ---------------------------------------------------------------------------
// Player State (singleton)
// ---------------------------------------------------------------------------

export interface PlayerState {
  process: ChildProcess | null;
  currentTrack: { title: string; url: string; channel?: string; duration?: string } | null;
  isPlaylist: boolean;
  playlistPath: string | null;
  isRadio: boolean;
  stationName?: string;
}

export const player: PlayerState = {
  process: null,
  currentTrack: null,
  isPlaylist: false,
  playlistPath: null,
  isRadio: false,
  stationName: undefined,
};

// ---------------------------------------------------------------------------
// Player stopped callback (for UI layer)
// ---------------------------------------------------------------------------

let onPlayerStopped: (() => void) | null = null;

export function setOnPlayerStopped(cb: (() => void) | null): void {
  onPlayerStopped = cb;
}

// ---------------------------------------------------------------------------
// mpv Management
// ---------------------------------------------------------------------------

export function killMpv(): void {
  if (player.process) {
    try {
      player.process.kill("SIGTERM");
    } catch {
      // already dead
    }
    player.process = null;
  }
  player.currentTrack = null;
  player.isPlaylist = false;
  player.isRadio = false;
  player.stationName = undefined;

  // Clean up socket file
  try {
    unlinkSync(MPV_SOCKET);
  } catch {
    // doesn't exist
  }

  // Clean up playlist file
  if (player.playlistPath) {
    try {
      unlinkSync(player.playlistPath);
    } catch {
      // doesn't exist
    }
    player.playlistPath = null;
  }

  onPlayerStopped?.();
}

export function spawnMpv(target: string, extraArgs: string[] = []): ChildProcess {
  killMpv();

  const mpvPath = requireBinary("mpv");
  const args = [
    "--no-video",
    `--input-ipc-server=${MPV_SOCKET}`,
    "--really-quiet",
    ...extraArgs,
    target,
  ];

  const proc = spawn(mpvPath, args, {
    stdio: "ignore",
    detached: false,
  });

  const cleanup = () => {
    player.process = null;
    player.currentTrack = null;
    player.isRadio = false;
    player.stationName = undefined;
    onPlayerStopped?.();
  };

  proc.once("error", cleanup);
  proc.once("exit", cleanup);

  player.process = proc;
  return proc;
}

// ---------------------------------------------------------------------------
// IPC Helpers
// ---------------------------------------------------------------------------

export function sendIpcCommand(command: unknown[]): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!player.process) {
      return reject(new Error("No active player. Use play_track first."));
    }

    let socket: Socket;
    const timeout = setTimeout(() => {
      socket?.destroy();
      reject(new Error("IPC timeout — mpv may not be ready"));
    }, IPC_TIMEOUT_MS);

    socket = createConnection(MPV_SOCKET, () => {
      socket.write(JSON.stringify({ command }) + "\n");
    });

    let buffer = "";
    socket.on("data", (data) => {
      buffer += data.toString();
      const newlineIdx = buffer.indexOf("\n");
      if (newlineIdx !== -1) {
        clearTimeout(timeout);
        const line = buffer.slice(0, newlineIdx);
        socket.destroy();
        try {
          resolve(JSON.parse(line));
        } catch {
          resolve({ data: line });
        }
      }
    });

    socket.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`IPC error: ${err.message}`));
    });
  });
}

export async function getProperty(name: string): Promise<any> {
  const result = await sendIpcCommand(["get_property", name]);
  return result?.data;
}

export async function setProperty(name: string, value: unknown): Promise<void> {
  await sendIpcCommand(["set_property", name, value]);
}

// ---------------------------------------------------------------------------
// Cleanup on Process Exit
// ---------------------------------------------------------------------------

let cleanupRegistered = false;

export function registerCleanup(): void {
  if (cleanupRegistered) return;
  cleanupRegistered = true;

  const cleanup = () => {
    killMpv();
  };

  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });
}

// ---------------------------------------------------------------------------
// Player State Accessors (for UI layer)
// ---------------------------------------------------------------------------

export function isPlayerActive(): boolean {
  return player.process !== null;
}

export function getCurrentTrack(): PlayerState["currentTrack"] {
  return player.currentTrack;
}

export function isPlaylistMode(): boolean {
  return player.isPlaylist;
}

export function isRadioMode(): boolean {
  return player.isRadio;
}

export function getStationName(): string | undefined {
  return player.stationName;
}

export { getProperty as getPlayerProperty };
