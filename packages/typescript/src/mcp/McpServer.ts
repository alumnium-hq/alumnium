/**
 * @module MCP Server
 * MCP Server for Alumnium - exposes browser automation capabilities to AI
 * coding agents.
 */

import { directMcpTools } from "./tools/directMcpTools.ts";

import { McpServer as Server } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { McpMode } from "./McpMode.ts";
import type { McpTransport } from "./McpTransport.ts";
import type { McpPolicy } from "./McpPolicy.ts";
import { McpState } from "./McpState.ts";
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

export namespace McpServer {
  export interface Props {
    mode?: McpMode;
    transport?: McpTransport;
    host?: string;
    port?: number;
    policy?: McpPolicy;
  }
}

export class McpServer {
  #mode: McpMode;
  #transport: McpTransport;
  #host: string;
  #port: number;
  #policy: McpPolicy;
  #httpServer: ReturnType<typeof Bun.serve> | undefined;
  #stdioServer: Server | undefined;
  #closing = false;
  #requests = new Set<Promise<Response>>();

  constructor({
    mode = "agentic",
    transport = "stdio",
    host = "127.0.0.1",
    port = 8014,
    policy = {},
  }: McpServer.Props = {}) {
    this.#mode = mode;
    this.#transport = transport;
    this.#host = host;
    this.#port = port;
    this.#policy = policy;
    logger.info("MCP server initialized");
  }

  async run(): Promise<void> {
    if (this.#transport === "http") {
      const server = (this.#httpServer = Bun.serve({
        hostname: this.#host,
        port: this.#port,
        idleTimeout: 0,
        fetch: (request) => this.fetch(request),
      }));
      logger.info(`Started MCP server at ${new URL("/mcp", server.url)}`);
    } else {
      logger.info("Starting MCP server with stdio transport");
      this.#stdioServer = this.#createServer();
      await this.#stdioServer.connect(new StdioServerTransport());
    }
  }

  /** Embed the same stateless HTTP transport without starting a listener. */
  async fetch(request: Request): Promise<Response> {
    if (this.#closing) return new Response(null, { status: 503 });
    const response = this.#handleRequest(request);
    this.#requests.add(response);
    try {
      return await response;
    } finally {
      this.#requests.delete(response);
    }
  }

  async close(): Promise<void> {
    this.#closing = true;
    await this.#httpServer?.stop();
    await Promise.allSettled(this.#requests);
    await this.#stdioServer?.close();
    await McpState.cleanupAllDrivers();
  }

  async #handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/mcp") return new Response(null, { status: 404 });

    const origin = request.headers.get("origin");
    if (origin !== null && origin !== url.origin)
      return new Response(null, { status: 403 });

    if (request.method !== "POST")
      return new Response(null, { status: 405, headers: { Allow: "POST" } });

    // Stateless MCP transports must be created per request. Browser and mobile
    // sessions remain in McpState until stop is called or the process exits.
    const server = this.#createServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
      enableJsonResponse: true,
    });
    try {
      await server.connect(transport);
      return await transport.handleRequest(request);
    } finally {
      await server.close();
    }
  }

  #createServer(): Server {
    const server = new Server({ name: "alumnium", version: ALUMNIUM_VERSION });
    this.#registerTools(server);
    return server;
  }

  /**
   * Register all MCP tools.
   */
  #registerTools(server: Server) {
    const tools =
      this.#mode === "direct" ? DIRECT_MCP_TOOLS : AGENTIC_MCP_TOOLS;
    tools.forEach((toolDef) => {
      const { name, description, inputSchema, execute } = toolDef;
      server.registerTool(
        toolDef.name,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { description, inputSchema: inputSchema as any },
        async (input: any) => {
          try {
            return { content: await execute(input, this.#policy) };
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
}
