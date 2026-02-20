// tests/server-registry.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("server registry", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("always includes musicbrainz server", async () => {
    const { getActiveServers } = await import("../src/servers/index.js");
    const servers = getActiveServers();
    expect(servers).toHaveProperty("musicbrainz");
  });

  it("generates wildcard allowed tools for each server", async () => {
    const { getActiveServers, getAllowedTools } = await import("../src/servers/index.js");
    const servers = getActiveServers();
    const tools = getAllowedTools(servers);
    expect(tools).toContain("mcp__musicbrainz__*");
  });
});
