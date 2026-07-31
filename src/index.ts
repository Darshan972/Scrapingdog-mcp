#!/usr/bin/env node
/**
 * Entry point: start the Scrapingdog MCP server over stdio.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createServer, SERVER_NAME, SERVER_VERSION } from "./server.js";

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr so we never corrupt the stdio JSON-RPC stream on stdout.
  console.error(`${SERVER_NAME} MCP server v${SERVER_VERSION} running on stdio`);
}

main().catch((err) => {
  console.error("Fatal error starting Scrapingdog MCP server:", err);
  process.exit(1);
});
