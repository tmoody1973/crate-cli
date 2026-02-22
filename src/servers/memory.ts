// src/servers/memory.ts
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { MemoryClient } from "mem0ai";

type ToolResult = { content: [{ type: "text"; text: string }] };

function toolResult(data: unknown): ToolResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }] };
}

const USER_ID = "crate_user";

const CATEGORIES = [
  "taste_preferences",
  "collecting_focus",
  "active_projects",
  "research_expertise",
  "workflow_patterns",
] as const;

let client: MemoryClient | null = null;

function getClient(): MemoryClient {
  if (client) return client;
  const apiKey = process.env.MEM0_API_KEY;
  if (!apiKey) throw new Error("MEM0_API_KEY is required");
  client = new MemoryClient({ apiKey });
  return client;
}

/** Reset client (for test isolation). */
export function _resetClient(): void {
  client = null;
}

// --- Handlers ---

export async function getUserContextHandler(args: { query: string }): Promise<ToolResult> {
  try {
    const c = getClient();
    const results = await c.search(args.query, { user_id: USER_ID, limit: 10 });
    const memories = results.map((m) => ({
      id: m.id,
      memory: m.memory,
      categories: m.categories,
      score: m.score,
    }));
    return toolResult({ memories, count: memories.length });
  } catch (error) {
    return toolError(error);
  }
}

export async function updateUserMemoryHandler(args: {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  category?: string;
}): Promise<ToolResult> {
  try {
    const c = getClient();
    const options: any = { user_id: USER_ID };
    if (args.category) {
      options.metadata = { category: args.category };
    }
    const result = await c.add(args.messages, options);
    return toolResult({
      status: "updated",
      memories_processed: result.length,
    });
  } catch (error) {
    return toolError(error);
  }
}

export async function rememberAboutUserHandler(args: {
  fact: string;
  category?: string;
}): Promise<ToolResult> {
  try {
    const c = getClient();
    const options: any = { user_id: USER_ID };
    if (args.category) {
      options.metadata = { category: args.category };
    }
    const result = await c.add(
      [{ role: "user", content: args.fact }],
      options,
    );
    return toolResult({
      status: "remembered",
      fact: args.fact,
      memories_processed: result.length,
    });
  } catch (error) {
    return toolError(error);
  }
}

export async function listUserMemoriesHandler(args: {
  category?: string;
}): Promise<ToolResult> {
  try {
    const c = getClient();
    const all = await c.getAll({ user_id: USER_ID });
    let memories = all.map((m) => ({
      id: m.id,
      memory: m.memory,
      categories: m.categories,
      created_at: m.created_at,
    }));
    if (args.category) {
      memories = memories.filter(
        (m) => m.categories?.includes(args.category!) ?? false,
      );
    }
    return toolResult({ memories, count: memories.length });
  } catch (error) {
    return toolError(error);
  }
}

// --- Tool definitions ---

const categoryEnum = z
  .enum(CATEGORIES)
  .optional()
  .describe(
    "Memory category: taste_preferences, collecting_focus, active_projects, research_expertise, workflow_patterns",
  );

const getUserContext = tool(
  "get_user_context",
  "Search the user's memory for relevant context. Returns ranked facts about the user's preferences, collecting habits, and research interests.",
  { query: z.string().describe("Search query to find relevant memories") },
  getUserContextHandler,
);

const updateUserMemory = tool(
  "update_user_memory",
  "Extract and store facts from a conversation. Mem0 automatically identifies new facts to remember from the messages.",
  {
    messages: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string(),
        }),
      )
      .describe("Conversation messages to extract memories from"),
    category: categoryEnum,
  },
  updateUserMemoryHandler,
);

const rememberAboutUser = tool(
  "remember_about_user",
  "Explicitly store a single fact about the user. Use when the user says something memorable about their taste, collection, or research.",
  {
    fact: z.string().describe("The fact to remember (e.g. 'User collects Japanese jazz vinyl')"),
    category: categoryEnum,
  },
  rememberAboutUserHandler,
);

const listUserMemories = tool(
  "list_user_memories",
  "List all stored memories about the user, optionally filtered by category.",
  { category: categoryEnum },
  listUserMemoriesHandler,
);

// --- Server export ---

export const memoryServer = createSdkMcpServer({
  name: "memory",
  version: "1.0.0",
  tools: [getUserContext, updateUserMemory, rememberAboutUser, listUserMemories],
});
