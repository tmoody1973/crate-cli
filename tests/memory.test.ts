// tests/memory.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockSearch = vi.fn();
const mockAdd = vi.fn();
const mockGetAll = vi.fn();

vi.mock("mem0ai", () => ({
  MemoryClient: class MockMemoryClient {
    constructor() {
      return {
        search: mockSearch,
        add: mockAdd,
        getAll: mockGetAll,
      };
    }
  },
}));

// Set API key before importing
process.env.MEM0_API_KEY = "test-key";

import {
  _resetClient,
  getUserContextHandler,
  updateUserMemoryHandler,
  rememberAboutUserHandler,
  listUserMemoriesHandler,
} from "../src/servers/memory.js";

function parse(result: any) {
  return JSON.parse(result.content[0].text);
}

describe("memory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetClient();
  });

  describe("get_user_context", () => {
    it("searches memories and returns ranked results", async () => {
      mockSearch.mockResolvedValue([
        { id: "1", memory: "Loves jazz vinyl", categories: ["taste_preferences"], score: 0.95 },
        { id: "2", memory: "Collects Blue Note pressings", categories: ["collecting_focus"], score: 0.85 },
      ]);

      const result = parse(await getUserContextHandler({ query: "jazz" }));
      expect(result.memories).toHaveLength(2);
      expect(result.memories[0].memory).toBe("Loves jazz vinyl");
      expect(result.memories[0].score).toBe(0.95);
      expect(mockSearch).toHaveBeenCalledWith("jazz", { user_id: "crate_user", limit: 10 });
    });

    it("handles empty results", async () => {
      mockSearch.mockResolvedValue([]);
      const result = parse(await getUserContextHandler({ query: "unknown" }));
      expect(result.memories).toHaveLength(0);
      expect(result.count).toBe(0);
    });

    it("handles errors gracefully", async () => {
      mockSearch.mockRejectedValue(new Error("API error"));
      const result = parse(await getUserContextHandler({ query: "test" }));
      expect(result.error).toBe("API error");
    });
  });

  describe("update_user_memory", () => {
    it("sends messages to mem0 for extraction", async () => {
      mockAdd.mockResolvedValue([{ id: "new-1", event: "ADD" }]);

      const messages = [
        { role: "user" as const, content: "I love Japanese jazz vinyl from the 70s" },
        { role: "assistant" as const, content: "Great taste! Let me find some." },
      ];

      const result = parse(await updateUserMemoryHandler({ messages }));
      expect(result.status).toBe("updated");
      expect(result.memories_processed).toBe(1);
      expect(mockAdd).toHaveBeenCalledWith(messages, { user_id: "crate_user" });
    });

    it("passes category as metadata", async () => {
      mockAdd.mockResolvedValue([]);
      await updateUserMemoryHandler({
        messages: [{ role: "user", content: "test" }],
        category: "taste_preferences",
      });
      expect(mockAdd).toHaveBeenCalledWith(
        [{ role: "user", content: "test" }],
        { user_id: "crate_user", metadata: { category: "taste_preferences" } },
      );
    });
  });

  describe("remember_about_user", () => {
    it("stores a single fact", async () => {
      mockAdd.mockResolvedValue([{ id: "new-1", event: "ADD" }]);
      const result = parse(
        await rememberAboutUserHandler({ fact: "Collects Japanese jazz vinyl" }),
      );
      expect(result.status).toBe("remembered");
      expect(result.fact).toBe("Collects Japanese jazz vinyl");
      expect(mockAdd).toHaveBeenCalledWith(
        [{ role: "user", content: "Collects Japanese jazz vinyl" }],
        { user_id: "crate_user" },
      );
    });

    it("stores with category", async () => {
      mockAdd.mockResolvedValue([]);
      await rememberAboutUserHandler({
        fact: "Prefers mono pressings",
        category: "collecting_focus",
      });
      expect(mockAdd).toHaveBeenCalledWith(
        [{ role: "user", content: "Prefers mono pressings" }],
        { user_id: "crate_user", metadata: { category: "collecting_focus" } },
      );
    });
  });

  describe("list_user_memories", () => {
    it("returns all memories", async () => {
      mockGetAll.mockResolvedValue([
        { id: "1", memory: "Fact A", categories: ["taste_preferences"], created_at: new Date() },
        { id: "2", memory: "Fact B", categories: ["collecting_focus"], created_at: new Date() },
      ]);

      const result = parse(await listUserMemoriesHandler({}));
      expect(result.memories).toHaveLength(2);
      expect(result.count).toBe(2);
      expect(mockGetAll).toHaveBeenCalledWith({ user_id: "crate_user" });
    });

    it("filters by category", async () => {
      mockGetAll.mockResolvedValue([
        { id: "1", memory: "Fact A", categories: ["taste_preferences"], created_at: new Date() },
        { id: "2", memory: "Fact B", categories: ["collecting_focus"], created_at: new Date() },
      ]);

      const result = parse(await listUserMemoriesHandler({ category: "taste_preferences" }));
      expect(result.memories).toHaveLength(1);
      expect(result.memories[0].memory).toBe("Fact A");
    });

    it("handles empty memories", async () => {
      mockGetAll.mockResolvedValue([]);
      const result = parse(await listUserMemoriesHandler({}));
      expect(result.memories).toHaveLength(0);
    });
  });
});
