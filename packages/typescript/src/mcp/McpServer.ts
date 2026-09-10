/**
 * @module MCP Server
 * MCP Server for Alumnium - exposes browser automation capabilities to AI
 * coding agents.
 */

import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { directMcpTools } from "./tools/directMcpTools.ts";

import { McpServer as Server } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { McpMode } from "./McpMode.ts";
import { ALUMNIUM_VERSION } from "../package.ts";
import { Logger } from "../telemetry/Logger.ts";
import { checkMcpTool } from "./tools/checkMcpTool.ts";
import { doMcpTool } from "./tools/doMcpTool.ts";
import { fetchAccessibilityTreeMcpTool } from "./tools/fetchAccessibilityTreeMcpTool.ts";
import { getMcpTool } from "./tools/getMcpTool.ts";
import { startMcpTool } from "./tools/startMcpTool.ts";
import { stopMcpTool } from "./tools/stopMcpTool.ts";
import { waitMcpTool } from "./tools/waitMcpTool.ts";

const logger = Logger.get(import.meta.url);

const AGENTIC_MCP_TOOLS = [
  checkMcpTool,
  doMcpTool,
  fetchAccessibilityTreeMcpTool,
  getMcpTool,
  startMcpTool,
  stopMcpTool,
  waitMcpTool,
];

const DIRECT_MCP_TOOLS = [
  startMcpTool,
  stopMcpTool,
  fetchAccessibilityTreeMcpTool,
  ...directMcpTools,
];

/**
 * MCP Server that wraps Alumnium functionality for AI agents.
 */
export class McpServer {
  #server: Server;

  constructor({ mode = "agentic" }: { mode?: McpMode } = {}) {
    this.#server = new Server({ name: "alumnium", version: ALUMNIUM_VERSION });
    this.#registerTools(mode);
    logger.info("MCP server initialized");
  }

  /**
   * Register all MCP tools.
   */
  #registerTools(mode: McpMode) {
    const tools = mode === "direct" ? DIRECT_MCP_TOOLS : AGENTIC_MCP_TOOLS;
    tools.forEach((toolDef) => {
      const { name, description, inputSchema, execute } = toolDef;
      this.#server.registerTool(
        toolDef.name,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { description, inputSchema: inputSchema as any },
        async (input: any) => {
          try {
            return { content: await execute(input) };
          } catch (error) {
            logger.error(`Error executing tool ${name}: {error}`, { error });
            return {
              isError: true,
              content: [
                { type: "text" as const, text: `Error: ${String(error)}` },
              ],
            };
          }
        },
      );
    });
  }

  async run(transport: Transport = new StdioServerTransport()): Promise<void> {
    logger.info("Starting MCP server with stdio transport");
    await this.#server.connect(transport);
  }
}
