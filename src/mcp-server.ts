#!/usr/bin/env node
// src/mcp-server.ts — Expose Crate tools as a standard MCP stdio server
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getActiveTools } from "./servers/tool-registry.js";

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: "crate-music-research",
    version: "0.2.3",
  });

  const activeTools = getActiveTools();
  let toolCount = 0;

  for (const { serverName, tools } of activeTools) {
    for (const t of tools) {
      const prefixedName = `${serverName}_${t.name}`;
      server.tool(
        prefixedName,
        t.description,
        t.inputSchema,
        async (args: Record<string, unknown>) => {
          return t.handler(args as any, {});
        },
      );
      toolCount++;
    }
  }

  process.stderr.write(
    `Crate MCP server started — ${toolCount} tools from ${activeTools.length} servers\n`,
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Direct invocation
const isDirectRun =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("/mcp-server.js") ||
  process.argv[1]?.endsWith("/mcp-server.ts");

if (isDirectRun) {
  startMcpServer().catch((err) => {
    process.stderr.write(`Crate MCP server error: ${err.message}\n`);
    process.exit(1);
  });
}
