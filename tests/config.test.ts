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
    expect(config.defaultModel).toBe("claude-sonnet-4-6");
  });

  it("detects available API keys", async () => {
    process.env.DISCOGS_TOKEN = "test-token";
    const { getConfig } = await import("../src/utils/config.js");
    const config = getConfig();
    expect(config.availableKeys).toContain("DISCOGS_TOKEN");
  });

  it("does not list missing keys as available", async () => {
    delete process.env.DISCOGS_TOKEN;
    const { getConfig } = await import("../src/utils/config.js");
    const config = getConfig();
    expect(config.availableKeys).not.toContain("DISCOGS_TOKEN");
  });
});
