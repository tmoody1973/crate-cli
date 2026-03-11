// tests/agent-keys.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the SDK — we can't spawn subprocesses in tests
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
  tool: vi.fn(),
  createSdkMcpServer: vi.fn(() => ({ type: "sdk" })),
}));

describe("CrateAgent with keys option", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Clear key-gated env vars to isolate tests
    delete process.env.DISCOGS_KEY;
    delete process.env.DISCOGS_SECRET;
    delete process.env.MEM0_API_KEY;
    delete process.env.LASTFM_API_KEY;
    delete process.env.GENIUS_ACCESS_TOKEN;
    delete process.env.TAVILY_API_KEY;
    delete process.env.EXA_API_KEY;
    delete process.env.TUMBLR_CONSUMER_KEY;
    delete process.env.TUMBLR_CONSUMER_SECRET;
    delete process.env.KERNEL_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("backward compat: string arg still sets model", async () => {
    const { CrateAgent } = await import("../src/agent/index.js");
    const agent = new CrateAgent("claude-opus-4-6");
    expect(agent.activeModel).toBe("claude-opus-4-6");
  });

  it("backward compat: no-arg constructor uses default model", async () => {
    const { CrateAgent } = await import("../src/agent/index.js");
    const agent = new CrateAgent();
    expect(agent.activeModel).toBe("claude-haiku-4-5-20251001");
  });

  it("options object: sets model", async () => {
    const { CrateAgent } = await import("../src/agent/index.js");
    const agent = new CrateAgent({ model: "claude-opus-4-6" });
    expect(agent.activeModel).toBe("claude-opus-4-6");
  });

  it("options object: activates genius server when key provided", async () => {
    const { CrateAgent } = await import("../src/agent/index.js");
    const agent = new CrateAgent({
      keys: { GENIUS_ACCESS_TOKEN: "test-token" },
    });
    expect(agent.serverNames).toContain("genius");
  });

  it("does not activate genius server when key is missing from both options and env", async () => {
    const { CrateAgent } = await import("../src/agent/index.js");
    const agent = new CrateAgent({ keys: {} });
    expect(agent.serverNames).not.toContain("genius");
  });

  it("activates discogs when both keys provided via options", async () => {
    const { CrateAgent } = await import("../src/agent/index.js");
    const agent = new CrateAgent({
      keys: { DISCOGS_KEY: "k", DISCOGS_SECRET: "s" },
    });
    expect(agent.serverNames).toContain("discogs");
  });

  it("does not activate discogs when only one key provided", async () => {
    const { CrateAgent } = await import("../src/agent/index.js");
    const agent = new CrateAgent({
      keys: { DISCOGS_KEY: "k" },
    });
    expect(agent.serverNames).not.toContain("discogs");
  });

  it("always includes musicbrainz regardless of keys", async () => {
    const { CrateAgent } = await import("../src/agent/index.js");
    const agent = new CrateAgent({ keys: {} });
    expect(agent.serverNames).toContain("musicbrainz");
  });

  it("activates browser server when KERNEL_API_KEY provided via keys", async () => {
    const { CrateAgent } = await import("../src/agent/index.js");
    const agent = new CrateAgent({
      keys: { KERNEL_API_KEY: "test-key" },
    });
    expect(agent.serverNames).toContain("browser");
    expect(agent.serverNames).toContain("whosampled");
  });
});

describe("getActiveServers with keys param", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.GENIUS_ACCESS_TOKEN;
    delete process.env.LASTFM_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("keys param takes precedence over missing env var", async () => {
    const { getActiveServers } = await import("../src/servers/index.js");
    const servers = getActiveServers({ GENIUS_ACCESS_TOKEN: "from-keys" });
    expect(servers).toHaveProperty("genius");
  });

  it("falls back to process.env when keys param omits a var", async () => {
    process.env.LASTFM_API_KEY = "from-env";
    const { getActiveServers } = await import("../src/servers/index.js");
    const servers = getActiveServers({});
    expect(servers).toHaveProperty("lastfm");
  });

  it("no keys and no env yields only always-on servers", async () => {
    const { getActiveServers } = await import("../src/servers/index.js");
    const servers = getActiveServers({});
    const names = Object.keys(servers);
    // Should not contain any key-gated servers
    expect(names).not.toContain("genius");
    expect(names).not.toContain("discogs");
    expect(names).not.toContain("memory");
    expect(names).not.toContain("browser");
    // Should contain always-on servers
    expect(names).toContain("musicbrainz");
    expect(names).toContain("wikipedia");
    expect(names).toContain("bandcamp");
  });
});
