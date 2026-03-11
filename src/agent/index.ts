// src/agent/index.ts
import { query } from "@anthropic-ai/claude-agent-sdk";
import { getActiveServers, getAllowedTools } from "../servers/index.js";
import { getSystemPrompt } from "./system-prompt.js";
import { resolveModel } from "../utils/config.js";
import {
  getUserContextHandler,
  updateUserMemoryHandler,
} from "../servers/memory.js";
import type { CrateEvent } from "./events.js";
import { SkillRegistry } from "../skills/registry.js";
import { Scratchpad } from "../utils/scratchpad.js";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

export interface CrateAgentOptions {
  model?: string;
  keys?: Record<string, string>;
}

/** Extract server name from a fully-qualified MCP tool name like mcp__musicbrainz__get_artist */
function serverFromToolName(toolName: string): string {
  const parts = toolName.split("__");
  return parts.length >= 3 ? (parts[1] ?? "unknown") : "unknown";
}

/** Strip the mcp__{server}__ prefix to get the bare tool name. */
function bareToolName(toolName: string): string {
  const parts = toolName.split("__");
  return parts.length >= 3 ? parts.slice(2).join("__") : toolName;
}

export class CrateAgent {
  private model: string;
  private keys?: Record<string, string>;
  private sessionId?: string;
  private servers: Record<string, unknown>;
  private totalCostUsd = 0;
  private memoryEnabled: boolean;
  private memoryContext?: string;
  private systemPromptSuffix?: string;
  private conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [];
  private skillRegistry = new SkillRegistry();
  private skillsLoadedPromise?: Promise<void>;
  private scratchpad: Scratchpad | null;

  constructor(optionsOrModel?: string | CrateAgentOptions) {
    if (typeof optionsOrModel === "string") {
      this.model = optionsOrModel;
    } else {
      this.model = optionsOrModel?.model ?? DEFAULT_MODEL;
      this.keys = optionsOrModel?.keys;
    }
    this.servers = getActiveServers(this.keys);
    this.memoryEnabled = !!(this.keys?.MEM0_API_KEY || process.env.MEM0_API_KEY);
    try {
      this.scratchpad = new Scratchpad();
    } catch {
      this.scratchpad = null;
    }
  }

  get activeModel(): string {
    return this.model;
  }

  get cost(): number {
    return this.totalCostUsd;
  }

  get serverNames(): string[] {
    return Object.keys(this.servers);
  }

  /** Reload servers from current keys/process.env (for hot-reloading after key changes). */
  reloadServers(): void {
    this.servers = getActiveServers(this.keys);
    this.memoryEnabled = !!(this.keys?.MEM0_API_KEY || process.env.MEM0_API_KEY);
  }

  switchModel(alias: string): string {
    const resolved = resolveModel(alias);
    this.model = resolved;
    return resolved;
  }

  /** Set a temporary suffix appended to the system prompt for the next call only. */
  setPromptSuffix(suffix: string | undefined): void {
    this.systemPromptSuffix = suffix;
  }

  /** Ensure skills are loaded (idempotent, race-safe). */
  private async ensureSkillsLoaded(): Promise<void> {
    if (!this.skillsLoadedPromise) {
      this.skillsLoadedPromise = this.skillRegistry.loadAll();
    }
    await this.skillsLoadedPromise;
  }

  /** List available research skills. */
  async listSkills(): Promise<Array<{ name: string; description: string }>> {
    await this.ensureSkillsLoaded();
    return this.skillRegistry.listSkills();
  }

  /** Load user context from Mem0 at session start. */
  async startSession(): Promise<void> {
    if (!this.memoryEnabled) return;
    try {
      const result = await getUserContextHandler({ query: "music preferences and collecting habits" });
      const data = JSON.parse(result.content[0].text);
      if (data.memories?.length) {
        const facts = data.memories.map((m: { memory: string }) => `- ${m.memory}`).join("\n");
        this.memoryContext = `## User Context (from previous sessions)\n${facts}`;
      }
    } catch (err) {
      if (process.env.DEBUG) console.warn("[Memory] Failed to load context:", err instanceof Error ? err.message : String(err));
    }
  }

  /** Save conversation to Mem0 at session end and close scratchpad. */
  async endSession(): Promise<void> {
    this.scratchpad?.close();
    if (!this.memoryEnabled || this.conversationHistory.length < 6) return;
    try {
      const recent = this.conversationHistory.slice(-20);
      await updateUserMemoryHandler({ messages: recent });
    } catch (err) {
      if (process.env.DEBUG) console.warn("[Memory] Failed to save session:", err instanceof Error ? err.message : String(err));
    }
  }

  /** Generate a research plan using a fast, non-streaming Claude call. */
  private async plan(userQuery: string): Promise<{ tasks: Array<{ id: number; description: string; done: boolean }> } | null> {
    const serverSummary = Object.keys(this.servers).join(", ");
    const planPrompt = `You are a music research planning assistant. Given a research query, decompose it into 3-7 concrete research tasks. Return only JSON: { "tasks": [{ "id": 1, "description": "...", "done": false }] }. Each task should correspond to a specific data source or synthesis step.\n\nAvailable servers: ${serverSummary}\n\nQuery: ${userQuery}`;

    try {
      const planStream = query({
        prompt: planPrompt,
        options: {
          model: this.model,
          systemPrompt: "You are a music research planning assistant. Return only valid JSON.",
          maxTurns: 1,
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
        },
      });

      let responseText = "";
      for await (const msg of planStream) {
        if (msg.type === "assistant") {
          const content = (msg as Record<string, unknown>).message as Record<string, unknown> | undefined;
          const blocks = (content?.content ?? []) as Array<Record<string, unknown>>;
          for (const block of blocks) {
            if (block.type === "text" && block.text) {
              responseText += block.text as string;
            }
          }
        }
        // Track planning cost
        if (
          msg.type === "result" &&
          (msg as Record<string, unknown>).subtype === "success"
        ) {
          this.totalCostUsd += ((msg as Record<string, unknown>).total_cost_usd as number) ?? 0;
        }
      }

      // Extract JSON from the response (may be wrapped in markdown code block)
      const jsonMatch = responseText.match(/\{[\s\S]*"tasks"[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]) as { tasks: Array<{ id: number; description: string; done: boolean }> };
      if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) return null;

      return parsed;
    } catch {
      // Planning is optional — skip on failure
      return null;
    }
  }

  /** Typed event stream for UI consumption. Yields CrateEvents instead of raw SDK messages. */
  async *research(userMessage: string): AsyncGenerator<CrateEvent> {
    this.conversationHistory.push({ role: "user", content: userMessage });

    // Ensure skills are loaded
    await this.ensureSkillsLoaded();

    let systemPrompt = getSystemPrompt();
    if (this.memoryContext) {
      systemPrompt = `${systemPrompt}\n\n${this.memoryContext}`;
    }
    if (this.systemPromptSuffix) {
      systemPrompt = `${systemPrompt}\n\n${this.systemPromptSuffix}`;
      this.systemPromptSuffix = undefined; // one-shot
    }

    // Match user query to a research skill and append its instructions
    const matchedSkill = this.skillRegistry.matchQuery(userMessage);
    if (matchedSkill) {
      systemPrompt = `${systemPrompt}\n\n## Active Research Skill: ${matchedSkill.name}\n${matchedSkill.instructions}`;
    }

    // Task planning pre-pass — only for substantive research queries
    const needsPlan = userMessage.split(/\s+/).length >= 4 && !/^(who|what) are you/i.test(userMessage) && !/^(hey|hi|hello|help|thanks)/i.test(userMessage);
    const researchPlan = needsPlan ? await this.plan(userMessage) : null;
    if (researchPlan) {
      yield { type: "plan", tasks: researchPlan.tasks };

      // Write plan to scratchpad
      this.scratchpad?.write({
        type: "plan",
        tasks: researchPlan.tasks.map((t) => ({ id: t.id, description: t.description })),
        timestamp: new Date().toISOString(),
      });

      // Include plan in the execution context
      const planText = researchPlan.tasks
        .map((t) => `${t.id}. ${t.description}`)
        .join("\n");
      systemPrompt = `${systemPrompt}\n\n## Research Plan for This Query\n${planText}\n\nWork through each task. You have full tool access.`;
    }

    const stream = query({
      prompt: userMessage,
      options: {
        model: this.model,
        systemPrompt,
        mcpServers: this.servers as Record<string, never>,
        allowedTools: getAllowedTools(this.servers),
        resume: this.sessionId,
        maxTurns: 25,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
      },
    });

    // Write query to scratchpad
    this.scratchpad?.write({
      type: "query",
      text: userMessage,
      timestamp: new Date().toISOString(),
    });

    const startTime = Date.now();
    const toolsUsed: string[] = [];
    let toolCallCount = 0;
    let assistantText = "";
    let answerStarted = false;

    // Track in-flight tool calls by SDK block ID for accurate duration measurement
    const toolStartTimes = new Map<string, { bare: string; server: string; startedAt: number }>();

    try {
      for await (const message of stream) {
        // Capture session ID
        if (
          message.type === "system" &&
          (message as Record<string, unknown>).subtype === "init"
        ) {
          this.sessionId = (message as Record<string, unknown>).session_id as string;
        }

        // Capture cost
        if (
          message.type === "result" &&
          (message as Record<string, unknown>).subtype === "success"
        ) {
          this.totalCostUsd += ((message as Record<string, unknown>).total_cost_usd as number) ?? 0;
        }

        // Process assistant messages — these contain tool_use and text blocks
        if (message.type === "assistant") {
          const content = (message as Record<string, unknown>).message as Record<string, unknown> | undefined;
          const blocks = (content?.content ?? []) as Array<Record<string, unknown>>;

          for (const block of blocks) {
            if (block.type === "tool_use") {
              const fullName = block.name as string;
              const blockId = (block.id as string) ?? fullName;
              const bare = bareToolName(fullName);
              const server = serverFromToolName(fullName);
              const input = block.input ?? {};

              toolCallCount++;
              if (!toolsUsed.includes(bare)) {
                toolsUsed.push(bare);
              }
              toolStartTimes.set(blockId, { bare, server, startedAt: Date.now() });

              yield { type: "tool_start", tool: bare, server, input };
            }

            if (block.type === "text" && block.text) {
              if (!answerStarted) {
                answerStarted = true;
                yield { type: "answer_start" };
              }
              const token = block.text as string;
              assistantText += token;
              yield { type: "answer_token", token };
            }
          }
        }

        // Tool results — emit tool_end when we see a tool_use_summary message
        if (message.type === "tool_use_summary") {
          const summary = message as Record<string, unknown>;
          const toolUseId = (summary.tool_use_id ?? "") as string;
          const fullName = (summary.tool_name ?? "") as string;
          const bare = bareToolName(fullName);
          const server = serverFromToolName(fullName);

          const tracked = toolStartTimes.get(toolUseId);
          const durationMs = tracked ? Date.now() - tracked.startedAt : 0;
          toolStartTimes.delete(toolUseId);

          // Write tool call to scratchpad
          this.scratchpad?.write({
            type: "tool_call",
            tool: bare,
            server,
            input: undefined, // Don't log full input to keep files small
            durationMs,
            timestamp: new Date().toISOString(),
          });

          yield { type: "tool_end", tool: bare, server, durationMs };
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred";
      yield { type: "error", message };
    }

    // Flush any remaining in-flight tools (SDK didn't emit summary for them)
    for (const [, tracked] of toolStartTimes) {
      yield { type: "tool_end", tool: tracked.bare, server: tracked.server, durationMs: Date.now() - tracked.startedAt };
    }
    toolStartTimes.clear();

    // Final done event
    const totalMs = Date.now() - startTime;

    // Write answer to scratchpad
    if (assistantText) {
      this.scratchpad?.write({
        type: "answer",
        text: assistantText.slice(0, 2000), // Truncate to keep files manageable
        totalMs,
        toolsUsed,
        timestamp: new Date().toISOString(),
      });
    }

    yield { type: "done", totalMs, toolsUsed, toolCallCount, costUsd: this.totalCostUsd };

    if (assistantText) {
      this.conversationHistory.push({ role: "assistant", content: assistantText });
    }
  }

  /** Raw SDK message stream — kept for backward compatibility (evals, MCP server). */
  async *chat(userMessage: string): AsyncGenerator<Record<string, unknown>> {
    this.conversationHistory.push({ role: "user", content: userMessage });

    let systemPrompt = getSystemPrompt();
    if (this.memoryContext) {
      systemPrompt = `${systemPrompt}\n\n${this.memoryContext}`;
    }

    const stream = query({
      prompt: userMessage,
      options: {
        model: this.model,
        systemPrompt,
        mcpServers: this.servers as Record<string, never>,
        allowedTools: getAllowedTools(this.servers),
        resume: this.sessionId,
        maxTurns: 25,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
      },
    });

    let assistantText = "";

    for await (const message of stream) {
      if (
        message.type === "system" &&
        (message as Record<string, unknown>).subtype === "init"
      ) {
        this.sessionId = (message as Record<string, unknown>).session_id as string;
      }
      if (
        message.type === "result" &&
        (message as Record<string, unknown>).subtype === "success"
      ) {
        this.totalCostUsd += ((message as Record<string, unknown>).total_cost_usd as number) ?? 0;
      }
      if (message.type === "assistant") {
        const content = (message as Record<string, unknown>).message as Record<string, unknown> | undefined;
        const blocks = (content?.content ?? []) as Array<Record<string, unknown>>;
        for (const block of blocks) {
          if (block.type === "text" && block.text) {
            assistantText += block.text as string;
          }
        }
      }
      yield message as Record<string, unknown>;
    }

    if (assistantText) {
      this.conversationHistory.push({ role: "assistant", content: assistantText });
    }
  }
}
