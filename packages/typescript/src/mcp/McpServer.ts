/**
 * @module MCP Server
 * MCP Server for Alumnium - exposes browser automation capabilities to AI
 * coding agents.
 */

import { McpServer as Server } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ALUMNIUM_VERSION } from "../package.ts";
import { getLogger } from "../utils/logger.ts";
import { checkMcpTool } from "./tools/checkMcpTool.ts";
import { doMcpTool } from "./tools/doMcpTool.ts";
import { fetchAccessibilityTreeMcpTool } from "./tools/fetchAccessibilityTreeMcpTool.ts";
import { getMcpTool } from "./tools/getMcpTool.ts";
import { startMcpTool } from "./tools/startMcpTool.ts";
import { stopMcpTool } from "./tools/stopMcpTool.ts";
import { waitMcpTool } from "./tools/waitMcpTool.ts";

const logger = getLogger(import.meta.url);

const MCP_TOOLS = [
  checkMcpTool,
  doMcpTool,
  fetchAccessibilityTreeMcpTool,
  getMcpTool,
  startMcpTool,
  stopMcpTool,
  waitMcpTool,
];

/**
 * MCP Server that wraps Alumnium functionality for AI agents.
 */
export class McpServer {
  #server: Server;

  constructor() {
    this.#server = new Server({ name: "alumnium", version: ALUMNIUM_VERSION });
    this.#registerTools();
    logger.info("MCP server initialized");
  }

  /**
   * Register all MCP tools.
   */
  #registerTools() {
    MCP_TOOLS.forEach((toolDef) => {
      const { name, description, Input: inputSchema, execute } = toolDef;
      this.#server.registerTool(
        toolDef.name,
        { description, inputSchema },
        async (input: any) => {
          try {
            return { content: await execute(input) };
          } catch (error) {
            logger.error(`Error executing tool ${name}: {error}`, { error });
            return {
              content: [
                { type: "text" as const, text: `Error: ${String(error)}` },
              ],
            };
          }
        },
      );
    });
  }

  /**
   * Run the MCP server using stdio transport.
   */
  async run(): Promise<void> {
    logger.info("Starting MCP server with stdio transport");
    const transport = new StdioServerTransport();
    await this.#server.connect(transport);
  }
}
