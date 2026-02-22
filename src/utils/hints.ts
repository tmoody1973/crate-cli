// src/utils/hints.ts
import { getDb } from "./db.js";

// ── SQLite schema ──────────────────────────────────────────────────────────

let initialized = false;

function db() {
  const d = getDb("hints");
  if (!initialized) {
    d.exec(`
      CREATE TABLE IF NOT EXISTS seen_hints (
        hint_id TEXT PRIMARY KEY,
        shown_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS user_state (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
    initialized = true;
  }
  return d;
}

// ── First-run detection ────────────────────────────────────────────────────

export function isFirstRun(): boolean {
  const row = db().prepare("SELECT value FROM user_state WHERE key = 'onboarding_complete'").get() as
    | { value: string }
    | undefined;
  return !row;
}

export function markOnboardingComplete(): void {
  db()
    .prepare("INSERT OR REPLACE INTO user_state (key, value) VALUES ('onboarding_complete', '1')")
    .run();
}

// ── Hint persistence ───────────────────────────────────────────────────────

export function hasSeenHint(id: string): boolean {
  const row = db().prepare("SELECT 1 FROM seen_hints WHERE hint_id = ?").get(id);
  return !!row;
}

export function markHintSeen(id: string): void {
  db().prepare("INSERT OR IGNORE INTO seen_hints (hint_id) VALUES (?)").run(id);
}

// ── Session message counter (in-memory) ────────────────────────────────────

let _messageCount = 0;

export function getMessageCount(): number {
  return _messageCount;
}

export function incrementMessageCount(): void {
  _messageCount++;
}

// ── Hint context + engine ──────────────────────────────────────────────────

export interface HintContext {
  toolsUsed: string[];
  messageCount: number;
  responseLength: number;
  hasTrackList: boolean;
  collectionSize: number;
  playlistCount: number;
}

interface HintDef {
  id: string;
  test: (ctx: HintContext) => boolean;
  text: string;
}

const HINTS: HintDef[] = [
  {
    id: "export_tip",
    test: (ctx) => ctx.responseLength > 2000,
    text: "Tip: Save research with 'export as markdown' or 'save to HTML'",
  },
  {
    id: "cost_tip",
    test: (ctx) => ctx.messageCount >= 5,
    text: "Tip: Use /cost to check token usage for this session",
  },
  {
    id: "playlist_tip",
    test: (ctx) => ctx.hasTrackList,
    text: "Tip: Say 'add these to a playlist' or 'export as M3U'",
  },
  {
    id: "collection_tip",
    test: (ctx) => ctx.toolsUsed.includes("collection_add"),
    text: "Tip: Use /collection to see your stats anytime",
  },
  {
    id: "keys_tip",
    test: (_ctx) => {
      // Show if any key-gated server is inactive
      const missing = [
        !process.env.DISCOGS_KEY,
        !process.env.GENIUS_ACCESS_TOKEN,
        !process.env.LASTFM_API_KEY,
        !process.env.MEM0_API_KEY,
        !process.env.TAVILY_API_KEY && !process.env.EXA_API_KEY,
      ];
      return missing.some(Boolean);
    },
    text: "Tip: Use /keys to add API keys for more sources",
  },
];

/**
 * Returns the first applicable, unseen hint — or null.
 * Rules: max 1 per response, none in first 2 messages, each shown once ever.
 */
export function getHintForContext(ctx: HintContext): string | null {
  if (ctx.messageCount < 3) return null;

  for (const hint of HINTS) {
    if (hint.test(ctx) && !hasSeenHint(hint.id)) {
      markHintSeen(hint.id);
      return hint.text;
    }
  }
  return null;
}
