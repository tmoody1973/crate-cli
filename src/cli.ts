#!/usr/bin/env node
// src/cli.ts
import "dotenv/config";
import { CrateAgent } from "./agent/index.js";
import { createApp } from "./ui/app.js";
import { resolveModel } from "./utils/config.js";

function parseArgs(args: string[]): { model?: string; help?: boolean; mcpServer?: boolean } {
  const result: { model?: string; help?: boolean; mcpServer?: boolean } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--model" || arg === "-m") {
      const next = args[i + 1];
      if (next) {
        result.model = resolveModel(next);
        i++;
      }
    } else if (arg === "--help" || arg === "-h") {
      result.help = true;
    } else if (arg === "--mcp-server") {
      result.mcpServer = true;
    }
  }

  return result;
}

function printUsage(): void {
  console.log(`
crate — AI-powered music research agent

Usage:
  crate                          Start interactive research session
  crate --model <name>           Start with a specific model
  crate --mcp-server             Start as MCP stdio server

Models:
  sonnet (default)               Everyday research
  opus                           Deep research sessions
  haiku                          Quick lookups

Options:
  --model, -m <name>             Set the Claude model
  --mcp-server                   Run as MCP server (stdio transport)
  --help, -h                     Show this help
`);
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.help) {
    printUsage();
    process.exit(0);
  }

  if (parsed.mcpServer) {
    const { startMcpServer } = await import("./mcp-server.js");
    await startMcpServer();
    return;
  }

  // If ANTHROPIC_API_KEY is set, create agent immediately; otherwise start in setup mode
  const agent = process.env.ANTHROPIC_API_KEY
    ? new CrateAgent(parsed.model)
    : null;

  const app = createApp(agent, { model: parsed.model });
  app.start();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
