import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SessionManager } from "./session.js";
import type { StewardConfig } from "./types.js";

/** Wire up MCP tools and return the server instance (not yet connected). */
export function createMcpServer(
  session: SessionManager,
  config: StewardConfig,
): McpServer {
  const server = new McpServer({
    name: "steward",
    version: "1.0.0",
  });

  server.registerTool(
    "ask",
    {
      description: "Ask the steward engineer a question about this codebase",
      inputSchema: { question: z.string(), caller: z.string() },
    },
    async ({ question, caller }) => {
      try {
        const answer = await session.ask(question, caller);
        const pct = Math.round(session.contextPercent * 100);
        const contextLine =
          session.contextPercent >= config.context_warning_threshold
            ? `\n\n(context: ${pct}% — consider calling clear to reset the session)`
            : `\n\n(context: ${pct}%)`;
        return {
          content: [{ type: "text" as const, text: answer + contextLine }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "status",
    {
      description: "Get the current status of the steward session",
    },
    async () => {
      const status = {
        state: session.state,
        currentCaller: session.caller,
        turnCount: session.turns,
        idleSeconds: session.idleSeconds,
        idleTimeoutMinutes: config.idle_timeout_minutes,
        contextPercent: Math.round(session.contextPercent * 100),
      };
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(status, null, 2) },
        ],
      };
    },
  );

  server.registerTool(
    "clear",
    {
      description:
        "Reset the steward session. The next ask will start fresh with a new warmup.",
    },
    async () => {
      session.destroy();
      return {
        content: [{ type: "text" as const, text: "Session cleared." }],
      };
    },
  );

  return server;
}
