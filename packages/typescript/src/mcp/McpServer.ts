/**
 * @module MCP Server
 * MCP Server for Alumnium - exposes browser automation capabilities to AI
 * coding agents.
 */

import { McpServer as Server } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ALUMNIUM_VERSION } from "../package.ts";
import { Logger } from "../telemetry/Logger.ts";
import { McpScenariosState } from "./scenarios/McpScenariosState.ts";
import { mcpTools } from "./tools/index.ts";

const logger = Logger.get(import.meta.url);

/**
 * MCP Server that wraps Alumnium functionality for AI agents.
 */
export class McpServer {
  #server: Server;
  #scenarios: McpScenariosState;

  constructor() {
    this.#server = new Server({ name: "alumnium", version: ALUMNIUM_VERSION });
    this.#scenarios = new McpScenariosState();
    this.#registerTools();
    logger.info("MCP server initialized");
  }

  /**
   * Register all MCP tools.
   */
  #registerTools() {
    mcpTools.forEach((tool) => {
      const { name, description, Input: inputSchema, execute } = tool;

      const executeTool = async (input: any) => {
        const context = { scenarios: this.#scenarios };
        try {
          const output = await execute(input, context);
          return output;
        } catch (error) {
          logger.error(`Error executing tool ${name}: {error}`, { error });
          return `Error: ${String(error)}`;
        }
      };

      this.#server.registerTool(
        tool.name,
        {
          description:
            typeof description === "function" ? description() : description,
          inputSchema,
        },
        async (input: any) => {
          const output = await executeTool(input);

          // Process tool execution in scenarios state.
          const hookResult = this.#scenarios.onToolExecuted({
            tool,
            input,
            output,
          });
          if (hookResult.status === "failure")
            return this.#outputToContent(hookResult);

          return this.#outputToContent(output);
        },
      );
    });
  }

  #outputToContent(output: any) {
    const text = typeof output === "string" ? output : JSON.stringify(output);
    return { content: [{ type: "text" as const, text }] };
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
