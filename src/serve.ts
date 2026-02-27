import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { SessionManager } from "./session.js";
import { createMcpServer } from "./server.js";
import { loadConfig } from "./types.js";

/**
 * `stewardmcp serve <path>` — load config from the target repo's .stewardmcp/
 * directory, start the Agent SDK session manager, and connect the MCP server
 * over stdio.
 */
export async function cmdServe(repoPath: string): Promise<void> {
  const resolved = path.resolve(repoPath);

  if (!fs.existsSync(resolved)) {
    console.error(`Repository path does not exist: ${resolved}`);
    process.exit(1);
  }

  const config = loadConfig(resolved);
  const session = new SessionManager(resolved, config);
  const server = createMcpServer(session, config);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stderr so it doesn't interfere with the MCP stdio transport
  console.error(`Steward MCP server running for: ${resolved}`);
  console.error(`TTL: ${config.idle_timeout_minutes} minutes`);
}
