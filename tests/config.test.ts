import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns default model when none specified", async () => {
    const { getConfig } = await import("../src/utils/config.js");
    const config = getConfig();
    expect(config.defaultModel).toBe("claude-haiku-4-5-20251001");
  });

  it("detects available API keys", async () => {
    process.env.DISCOGS_KEY = "test-key";
    const { getConfig } = await import("../src/utils/config.js");
    const config = getConfig();
    expect(config.availableKeys).toContain("DISCOGS_KEY");
  });

  it("does not list missing keys as available", async () => {
    delete process.env.DISCOGS_KEY;
    const { getConfig } = await import("../src/utils/config.js");
    const config = getConfig();
    expect(config.availableKeys).not.toContain("DISCOGS_KEY");
  });
});

describe("resolveKey", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns user env var when present", async () => {
    process.env.LASTFM_API_KEY = "user-lastfm-key";
    const { resolveKey } = await import("../src/utils/config.js");
    expect(resolveKey("LASTFM_API_KEY")).toBe("user-lastfm-key");
  });

  it("returns embedded key when env var is absent", async () => {
    delete process.env.LASTFM_API_KEY;
    const { resolveKey } = await import("../src/utils/config.js");
    expect(resolveKey("LASTFM_API_KEY")).toBeTruthy();
  });

  it("returns undefined for services without embedded keys", async () => {
    delete process.env.GENIUS_ACCESS_TOKEN;
    const { resolveKey } = await import("../src/utils/config.js");
    expect(resolveKey("GENIUS_ACCESS_TOKEN")).toBeUndefined();
  });

  it("user env var takes priority over embedded key", async () => {
    process.env.DISCOGS_KEY = "my-own-discogs-key";
    const { resolveKey } = await import("../src/utils/config.js");
    expect(resolveKey("DISCOGS_KEY")).toBe("my-own-discogs-key");
  });
});

describe("isUsingEmbeddedKey", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns true when using embedded key (no user override)", async () => {
    delete process.env.LASTFM_API_KEY;
    const { isUsingEmbeddedKey } = await import("../src/utils/config.js");
    expect(isUsingEmbeddedKey("lastfm")).toBe(true);
  });

  it("returns false when user provides own key", async () => {
    process.env.LASTFM_API_KEY = "user-key";
    const { isUsingEmbeddedKey } = await import("../src/utils/config.js");
    expect(isUsingEmbeddedKey("lastfm")).toBe(false);
  });

  it("returns false for services without embedded keys", async () => {
    const { isUsingEmbeddedKey } = await import("../src/utils/config.js");
    expect(isUsingEmbeddedKey("genius")).toBe(false);
  });
});
