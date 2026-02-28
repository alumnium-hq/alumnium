/**
 * @module MCP Server
 * MCP Server for Alumnium - exposes browser automation capabilities to AI coding agents.
 */

import { Server as MCPServer } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getLogger } from "../utils/logger.js";
import * as handlers from "./handlers.js";
import * as tools from "./tools.js";

const logger = getLogger(import.meta.url);

export class Server {
  /** MCP Server that wraps Alumnium functionality for AI agents. */

  server: MCPServer;

  constructor() {
    this.server = new MCPServer(
      {
        name: "alumnium",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );
    this.setupHandlers();
    logger.info("Server initialized");
  }

  setupHandlers(): void {
    /** Register all MCP handlers. */
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      /** List all available Alumnium tools. */
      return { tools: tools.getToolDefinitions() };
    });

    this.server.setRequestHandler(
      CallToolRequestSchema,
      // @ts-expect-error -- TODO: Missing Python API
      async (request: {
        params: { name: string; arguments?: Record<string, unknown> };
      }) => {
        /** Handle tool execution. */
        const name = request.params.name;
        const argumentsValue = request.params.arguments || {};

        logger.debug(`MCP tool called: ${name}`);
        try {
          if (name === "start_driver") {
            return {
              content: await handlers.handleStartDriver(argumentsValue),
            };
          } else if (name === "do") {
            return { content: await handlers.handleDo(argumentsValue) };
          } else if (name === "check") {
            return { content: await handlers.handleCheck(argumentsValue) };
          } else if (name === "get") {
            return { content: await handlers.handleGet(argumentsValue) };
          } else if (name === "fetch_accessibility_tree") {
            return {
              content:
                await handlers.handleFetchAccessibilityTree(argumentsValue),
            };
          } else if (name === "wait") {
            return { content: await handlers.handleWait(argumentsValue) };
          } else if (name === "stop_driver") {
            return { content: await handlers.handleStopDriver(argumentsValue) };
          } else {
            logger.error(`Unknown tool called: ${name}`);
            throw new Error(`Unknown tool: ${name}`);
          }
        } catch (error) {
          logger.error(`Error executing tool ${name}: ${error}`);
          return {
            content: [{ type: "text", text: `Error: ${String(error)}` }],
          };
        }
      },
    );
  }

  async run(): Promise<void> {
    /** Run the MCP server using stdio transport. */
    logger.info("Starting MCP server with stdio transport");
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

export function main(): void {
  /** Entry point for the MCP server. */
  const server = new Server();
  void server.run();
}

if (import.meta.main) {
  main();
}
