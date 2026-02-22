// tests/db.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getDb, closeAll, _setDbDir } from "../src/utils/db.js";

describe("db", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "crate-db-test-"));
    _setDbDir(testDir);
  });

  afterEach(() => {
    closeAll();
    rmSync(testDir, { recursive: true, force: true });
  });

  it("creates a database file and returns a Database instance", () => {
    const db = getDb("test");
    expect(db).toBeDefined();
    expect(typeof db.exec).toBe("function");
  });

  it("returns the same instance on repeated calls (singleton)", () => {
    const db1 = getDb("test");
    const db2 = getDb("test");
    expect(db1).toBe(db2);
  });

  it("returns different instances for different names", () => {
    const db1 = getDb("alpha");
    const db2 = getDb("beta");
    expect(db1).not.toBe(db2);
  });

  it("enables WAL mode", () => {
    const db = getDb("test");
    const mode = db.pragma("journal_mode", { simple: true });
    expect(mode).toBe("wal");
  });

  it("enables foreign keys", () => {
    const db = getDb("test");
    const fk = db.pragma("foreign_keys", { simple: true });
    expect(fk).toBe(1);
  });

  it("closeAll closes all instances and allows re-creation", () => {
    const db1 = getDb("test");
    db1.exec("CREATE TABLE t (id INTEGER)");
    closeAll();
    // After closing, getting the same name should return a new instance
    const db2 = getDb("test");
    expect(db2).not.toBe(db1);
    // Table should still exist (same file)
    const rows = db2.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='t'").all();
    expect(rows).toHaveLength(1);
  });
});
