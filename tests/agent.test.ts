// tests/agent.test.ts
import { describe, it, expect, vi } from "vitest";

// Mock the SDK — we can't spawn subprocesses in tests
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
  tool: vi.fn(),
  createSdkMcpServer: vi.fn(() => ({ type: "sdk" })),
}));

describe("CrateAgent", () => {
  it("defaults to haiku model", async () => {
    const { CrateAgent } = await import("../src/agent/index.js");
    const agent = new CrateAgent();
    expect(agent.activeModel).toBe("claude-haiku-4-5-20251001");
  });

  it("accepts a model in constructor", async () => {
    const { CrateAgent } = await import("../src/agent/index.js");
    const agent = new CrateAgent("claude-opus-4-6");
    expect(agent.activeModel).toBe("claude-opus-4-6");
  });

  it("switches model by alias", async () => {
    const { CrateAgent } = await import("../src/agent/index.js");
    const agent = new CrateAgent();
    const resolved = agent.switchModel("opus");
    expect(resolved).toBe("claude-opus-4-6");
    expect(agent.activeModel).toBe("claude-opus-4-6");
  });

  it("switches model by full string", async () => {
    const { CrateAgent } = await import("../src/agent/index.js");
    const agent = new CrateAgent();
    const resolved = agent.switchModel("claude-haiku-4-5-20251001");
    expect(resolved).toBe("claude-haiku-4-5-20251001");
  });
});

describe("system prompt", () => {
  it("returns a non-empty string", async () => {
    const { getSystemPrompt } = await import("../src/agent/system-prompt.js");
    const prompt = getSystemPrompt();
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(100);
  });

  it("mentions MusicBrainz capabilities", async () => {
    const { getSystemPrompt } = await import("../src/agent/system-prompt.js");
    const prompt = getSystemPrompt();
    expect(prompt).toContain("MusicBrainz");
  });
});
