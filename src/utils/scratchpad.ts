// src/utils/scratchpad.ts — Per-session research audit trail as JSONL
import { mkdirSync, appendFileSync, readdirSync, readFileSync, unlinkSync, closeSync, openSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";

export type ScratchpadEntry =
  | { type: "session_start"; sessionId: string; timestamp: string }
  | { type: "query"; text: string; timestamp: string }
  | { type: "plan"; tasks: Array<{ id: number; description: string }>; timestamp: string }
  | { type: "tool_call"; tool: string; server: string; input: unknown; durationMs: number; timestamp: string }
  | { type: "answer"; text: string; totalMs: number; toolsUsed: string[]; timestamp: string };

/** Generate a session ID in the format YYYY-MM-DD-HHmmss_8hexchars */
function generateSessionId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8).replace(/:/g, "");
  const hex = randomBytes(4).toString("hex");
  return `${date}-${time}_${hex}`;
}

/** Get the scratchpad directory path. */
function getScratchpadDir(): string {
  return join(homedir(), ".crate", "scratchpad");
}

export class Scratchpad {
  private readonly filePath: string;
  private fd: number;
  readonly sessionId: string;

  constructor(sessionId?: string) {
    this.sessionId = sessionId ?? generateSessionId();
    const dir = getScratchpadDir();
    mkdirSync(dir, { recursive: true });
    this.filePath = join(dir, `${this.sessionId}.jsonl`);
    this.fd = openSync(this.filePath, "a");

    // Write session start entry
    this.write({
      type: "session_start",
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
    });

    // Rotate old files (keep 50 most recent)
    this.rotate(50);
  }

  /** Synchronous append of a single entry as a JSON line. */
  write(entry: ScratchpadEntry): void {
    try {
      appendFileSync(this.fd, JSON.stringify(entry) + "\n");
    } catch {
      // Silently fail — scratchpad is non-critical
    }
  }

  /** Close the file descriptor. */
  close(): void {
    try {
      closeSync(this.fd);
    } catch {
      // Ignore
    }
  }

  /** Keep only the N most recent scratchpad files, delete older ones. */
  private rotate(keep: number): void {
    try {
      const dir = getScratchpadDir();
      const files = readdirSync(dir)
        .filter((f) => f.endsWith(".jsonl"))
        .sort()
        .reverse();

      const toDelete = files.slice(keep);
      for (const file of toDelete) {
        try {
          unlinkSync(join(dir, file));
        } catch {
          // Ignore individual delete failures
        }
      }
    } catch {
      // Ignore rotation failures
    }
  }
}

/** Read recent scratchpad files — returns parsed entries from the N most recent sessions. */
export function readRecentScratchpads(count = 5): Array<{ sessionId: string; entries: ScratchpadEntry[] }> {
  const dir = getScratchpadDir();
  let files: string[];
  try {
    files = readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .sort()
      .reverse()
      .slice(0, count);
  } catch {
    return [];
  }

  const results: Array<{ sessionId: string; entries: ScratchpadEntry[] }> = [];
  for (const file of files) {
    const sessionId = file.replace(".jsonl", "");
    try {
      const raw = readFileSync(join(dir, file), "utf-8");
      const entries = raw
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as ScratchpadEntry);
      results.push({ sessionId, entries });
    } catch {
      // Skip unparseable files
    }
  }
  return results;
}
