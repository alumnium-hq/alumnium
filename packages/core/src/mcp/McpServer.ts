/**
 * @module MCP Server
 * MCP Server for Alumnium - exposes browser automation capabilities to AI
 * coding agents.
 */

import { McpServer as Server } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getAlumniumVersion } from "../macros.js" with { type: "macro" };
import { getLogger } from "../utils/logger.js";
import { checkMcpTool } from "./tools/checkMcpTool.js";
import { doMcpTool } from "./tools/doMcpTool.js";
import { fetchAccessibilityTreeMcpTool } from "./tools/fetchAccessibilityTreeMcpTool.js";
import { getMcpTool } from "./tools/getMcpTool.js";
import { startDriverMcpTool } from "./tools/startDriverMcpTool.js";
import { stopDriverMcpTool } from "./tools/stopDriverMcpTool.js";
import { waitMcpTool } from "./tools/waitMcpTool.js";

const logger = getLogger(import.meta.url);

const version = await getAlumniumVersion();

console.log();

const MCP_TOOLS = [
  checkMcpTool,
  doMcpTool,
  fetchAccessibilityTreeMcpTool,
  getMcpTool,
  startDriverMcpTool,
  stopDriverMcpTool,
  waitMcpTool,
];

/**
 * MCP Server that wraps Alumnium functionality for AI agents.
 */
export class McpServer {
  #server: Server;

  constructor() {
    this.#server = new Server({ name: "alumnium", version });
    this.#registerTools();
    logger.info("Server initialized");
  }

  /**
   * Register all MCP tools.
   */
  #registerTools() {
    MCP_TOOLS.forEach((toolDef) => {
      const { name, description, inputSchema, execute } = toolDef;
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
