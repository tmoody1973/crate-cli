import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("tool registry", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.GENIUS_ACCESS_TOKEN;
    delete process.env.MEM0_API_KEY;
    delete process.env.TAVILY_API_KEY;
    delete process.env.EXA_API_KEY;
    delete process.env.TUMBLR_CONSUMER_KEY;
    delete process.env.TUMBLR_CONSUMER_SECRET;
    delete process.env.KERNEL_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("includes always-on and embedded-key servers in MCP mode", async () => {
    const { getActiveTools } = await import("../src/servers/tool-registry.js");
    const serverNames = getActiveTools().map((group) => group.serverName);

    expect(serverNames).toContain("musicbrainz");
    expect(serverNames).toContain("itunes");
    expect(serverNames).toContain("ticketmaster");
    expect(serverNames).toContain("discogs");
    expect(serverNames).toContain("lastfm");
  });

  it("includes browser-backed tools when the kernel key is present", async () => {
    process.env.KERNEL_API_KEY = "kernel-test-key";
    const { getActiveTools } = await import("../src/servers/tool-registry.js");
    const serverNames = getActiveTools().map((group) => group.serverName);

    expect(serverNames).toContain("browser");
    expect(serverNames).toContain("whosampled");
  });
});
