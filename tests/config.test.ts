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
