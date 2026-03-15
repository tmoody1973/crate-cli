import { describe, expect, it } from "vitest";
import { classifyQuery } from "../src/agent/router.js";

describe("classifyQuery", () => {
  it("routes greetings to chat", () => {
    expect(classifyQuery("hey there")).toBe("chat");
    expect(classifyQuery("thanks")).toBe("chat");
  });

  it("routes straightforward factual prompts to lookup", () => {
    expect(classifyQuery("Who produced Madvillainy?")).toBe("lookup");
    expect(classifyQuery("Play Accordion by Madvillain")).toBe("lookup");
  });

  it("routes multi-step synthesis prompts to research", () => {
    expect(
      classifyQuery(
        "Map the Detroit-Berlin techno connection from the late 80s to today and explain the bridge artists.",
      ),
    ).toBe("research");
    expect(
      classifyQuery(`Build me a playlist.\nUse late-60s jazz.\nFor each track, explain who sampled it.`),
    ).toBe("research");
  });
});
