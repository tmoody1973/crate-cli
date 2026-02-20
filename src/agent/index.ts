// src/agent/index.ts
import { query } from "@anthropic-ai/claude-agent-sdk";
import { getActiveServers, getAllowedTools } from "../servers/index.js";
import { getSystemPrompt } from "./system-prompt.js";
import { resolveModel } from "../utils/config.js";

const DEFAULT_MODEL = "claude-sonnet-4-6";

export class CrateAgent {
  private model: string;
  private sessionId?: string;
  private servers: Record<string, any>;
  private totalCostUsd = 0;

  constructor(model?: string) {
    this.model = model ?? DEFAULT_MODEL;
    this.servers = getActiveServers();
  }

  get activeModel(): string {
    return this.model;
  }

  get cost(): number {
    return this.totalCostUsd;
  }

  switchModel(alias: string): string {
    const resolved = resolveModel(alias);
    this.model = resolved;
    return resolved;
  }

  async *chat(userMessage: string): AsyncGenerator<any> {
    const stream = query({
      prompt: userMessage,
      options: {
        model: this.model,
        systemPrompt: getSystemPrompt(),
        mcpServers: this.servers as any,
        allowedTools: getAllowedTools(this.servers),
        resume: this.sessionId,
        maxTurns: 25,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
      },
    });

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
      yield message;
    }
  }
}
