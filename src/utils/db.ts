// src/utils/db.ts
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

let baseDir = join(homedir(), ".crate");
const instances = new Map<string, Database.Database>();

/** Override base directory (for test isolation). */
export function _setDbDir(dir: string): void {
  baseDir = dir;
}

/** Get (or lazily create) a SQLite database at ~/.crate/{name}.db */
export function getDb(name: string): Database.Database {
  const existing = instances.get(name);
  if (existing) return existing;

  mkdirSync(baseDir, { recursive: true });
  const dbPath = join(baseDir, `${name}.db`);
  const db = new Database(dbPath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  instances.set(name, db);
  return db;
}

/** Close all open database connections. */
export function closeAll(): void {
  for (const [name, db] of instances) {
    db.close();
    instances.delete(name);
  }
}
