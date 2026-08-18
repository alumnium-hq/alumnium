/**
 * @module MCP Server
 * MCP Server for Alumnium - exposes browser automation capabilities to AI
 * coding agents.
 */

import { McpServer as Server } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  ServerNotification,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import type { LlmUsageStats } from "../llm/llmSchema.ts";
import { ALUMNIUM_VERSION } from "../package.ts";
import { Logger } from "../telemetry/Logger.ts";
import { MCP_CACHE_LOOKUPS_META_KEY } from "./mcpCacheLookups.ts";
import { parseMcpNoCache } from "./mcpNoCache.ts";
import {
  diffMcpTokenUsage,
  MCP_TOKEN_USAGE_META_KEY,
} from "./mcpTokenUsage.ts";
import { McpState } from "./McpState.ts";
import { checkMcpTool } from "./tools/checkMcpTool.ts";
import { doMcpTool } from "./tools/doMcpTool.ts";
import { fetchAccessibilityTreeMcpTool } from "./tools/fetchAccessibilityTreeMcpTool.ts";
import { getMcpTool } from "./tools/getMcpTool.ts";
import { McpTool } from "./tools/McpTool.ts";
import { startMcpTool } from "./tools/startMcpTool.ts";
import { stopMcpTool } from "./tools/stopMcpTool.ts";
import { waitMcpTool } from "./tools/waitMcpTool.ts";

const logger = Logger.get(import.meta.url);

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
      const { name, description, inputSchema, execute } = toolDef;
      this.#server.registerTool(
        toolDef.name,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { description, inputSchema: inputSchema as any },
        async (
          input: any,
          extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
        ) => {
          const id = McpTool.WithDriverId.safeParse(input).data?.id;
          const statsBefore = await readStats(id);

          try {
            // NOTE: Read off the request `_meta` rather than the input, so that
            // the switch stays out of every tool's input schema. See
            // `mcpNoCache`.
            const content = await execute(input, {
              noCache: parseMcpNoCache(extra._meta),
            });
            const meta = buildStatsMeta(statsBefore, await readStats(id));

            return meta ? { content, _meta: meta } : { content };
          } catch (error) {
            logger.error(`Error executing tool ${name}: {error}`, { error });
            // NOTE: Flagged, not just worded as an error. It is what the MCP
            // protocol says a failed call is, so it's what both consumers can
            // tell one by: an agent, which a flagged result stops rather than
            // being left to notice a text block that starts with "Error:", and a
            // playback, which fails on a call that errors now and didn't when it
            // was recorded. See `ScenarioPlayer.readOutputError`.
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

  /**
   * Run the MCP server using stdio transport.
   */
  async run(): Promise<void> {
    logger.info("Starting MCP server with stdio transport");
    const transport = new StdioServerTransport();
    await this.#server.connect(transport);
  }
}

/**
 * Reads the driver session's current cache lookup counters.
 *
 * NOTE: In HTTP client mode (`server_url` passed to `start`) this costs an extra
 * `GET /stats` request per call, while the default native mode only reads a
 * property.
 *
 * @param id - Driver ID, absent for tools that don't operate on a driver.
 * @returns Counters, or `undefined` when there is no driver to ask.
 */
async function readStats(
  id: string | undefined,
): Promise<LlmUsageStats | undefined> {
  if (!id) return undefined;

  const al = McpState.findDriverAlumni(id);
  if (!al) return undefined;

  try {
    return await al.getStats();
  } catch (error) {
    // NOTE: Reporting the counters is purely informational, so it must never fail
    // a tool call.
    logger.debug(`Failed to read stats for driver ${id}: {error}`, {
      error,
    });
    return undefined;
  }
}

/**
 * Builds the tool result `_meta` describing what a call spent - the cache lookups
 * it made and the tokens they cost.
 *
 * NOTE: Both come from the one pair of readings around the call, which is why
 * they are built together. In HTTP client mode a reading is a request, so asking
 * twice would double the cost of every tool call.
 *
 * @param before - Counters before the call.
 * @param after - Counters after the call.
 * @returns Meta object, or `undefined` when the call spent nothing (e.g. `wait`
 *   for a number of seconds) or the counters are unavailable (`start` has no
 *   driver yet, `stop` has already disposed of it).
 */
function buildStatsMeta(
  before: LlmUsageStats | undefined,
  after: LlmUsageStats | undefined,
): Record<string, unknown> | undefined {
  if (!before || !after) return undefined;

  const meta: Record<string, unknown> = {};

  const lookups = {
    hits: after.lookups.hits - before.lookups.hits,
    misses: after.lookups.misses - before.lookups.misses,
  };
  if (lookups.hits + lookups.misses > 0)
    meta[MCP_CACHE_LOOKUPS_META_KEY] = lookups;

  const usage = diffMcpTokenUsage(
    { total: before.total, cached: before.cache },
    { total: after.total, cached: after.cache },
  );
  if (usage) meta[MCP_TOKEN_USAGE_META_KEY] = usage;

  return Object.keys(meta).length ? meta : undefined;
}
