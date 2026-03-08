// src/agent/events.ts — Typed event stream for the Crate agent loop

export type CrateEvent =
  | { type: "thinking"; text: string }
  | { type: "tool_start"; tool: string; server: string; input: unknown }
  | { type: "tool_end"; tool: string; server: string; durationMs: number; resultSummary?: string }
  | { type: "answer_start" }
  | { type: "answer_token"; token: string }
  | { type: "done"; totalMs: number; toolsUsed: string[]; toolCallCount: number; costUsd: number }
  | { type: "error"; message: string }
  | { type: "plan"; tasks: Array<{ id: number; description: string; done: boolean }> };
