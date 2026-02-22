// src/agent/index.ts
import { query } from "@anthropic-ai/claude-agent-sdk";
import { getActiveServers, getAllowedTools } from "../servers/index.js";
import { getSystemPrompt } from "./system-prompt.js";
import { resolveModel } from "../utils/config.js";
import {
  getUserContextHandler,
  updateUserMemoryHandler,
} from "../servers/memory.js";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

export class CrateAgent {
  private model: string;
  private sessionId?: string;
  private servers: Record<string, any>;
  private totalCostUsd = 0;
  private memoryEnabled: boolean;
  private memoryContext?: string;
  private conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [];

  constructor(model?: string) {
    this.model = model ?? DEFAULT_MODEL;
    this.servers = getActiveServers();
    this.memoryEnabled = !!process.env.MEM0_API_KEY;
  }

  get activeModel(): string {
    return this.model;
  }

  get cost(): number {
    return this.totalCostUsd;
  }

  /** Reload servers from current process.env (for hot-reloading after key changes). */
  reloadServers(): void {
    this.servers = getActiveServers();
    this.memoryEnabled = !!process.env.MEM0_API_KEY;
  }

  switchModel(alias: string): string {
    const resolved = resolveModel(alias);
    this.model = resolved;
    return resolved;
  }

  /** Load user context from Mem0 at session start. */
  async startSession(): Promise<void> {
    if (!this.memoryEnabled) return;
    try {
      const result = await getUserContextHandler({ query: "music preferences and collecting habits" });
      const data = JSON.parse(result.content[0].text);
      if (data.memories?.length) {
        const facts = data.memories.map((m: any) => `- ${m.memory}`).join("\n");
        this.memoryContext = `## User Context (from previous sessions)\n${facts}`;
      }
    } catch {
      // Silently continue if memory is unavailable
    }
  }

  /** Save conversation to Mem0 at session end. */
  async endSession(): Promise<void> {
    if (!this.memoryEnabled || this.conversationHistory.length < 6) return;
    try {
      const recent = this.conversationHistory.slice(-20);
      await updateUserMemoryHandler({ messages: recent });
    } catch {
      // Silently continue
    }
  }

  async *chat(userMessage: string): AsyncGenerator<any> {
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
        mcpServers: this.servers as any,
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
        (message as any).subtype === "init"
      ) {
        this.sessionId = (message as any).session_id;
      }
      if (
        message.type === "result" &&
        (message as any).subtype === "success"
      ) {
        this.totalCostUsd += (message as any).total_cost_usd ?? 0;
      }
      // Track assistant text for memory
      if (message.type === "assistant") {
        const content = (message as any).message?.content;
        if (content) {
          for (const block of content) {
            if (block.type === "text" && block.text) {
              assistantText += block.text;
            }
          }
        }
      }
      yield message;
    }

    if (assistantText) {
      this.conversationHistory.push({ role: "assistant", content: assistantText });
    }
  }
}
