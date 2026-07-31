import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Telemetry } from "../telemetry/Telemetry.ts";
import { retry } from "../utils/retry.ts";
import { ScenarioAlumniumMcp } from "./ScenarioAlumniumMcp.ts";

const { logger } = Telemetry.get(import.meta.url);

/** Three attempts, waiting 1s, 3s and 9s in between. */
const EXPONENTIAL_RETRY: retry.Options = {
  maxAttempts: 3,
  backOff: 1000,
  backOffFactor: 3,
};

const TOOL_USE_NAME_PREFIX = "mcp__";
const TOOL_USE_NAME_SEPARATOR = "__";
// NOTE: Non-greedy server name, since a tool name can contain the separator
// too. Only used to tell an MCP tool call apart from a built-in one, the server
// it belongs to is resolved against the configured ones by name.
const TOOL_USE_NAME_PATTERN = /^mcp__(.+?)__(.+)$/;

export namespace ScenarioExternalMcp {
  export type Output = Awaited<ReturnType<Client["callTool"]>>;

  export interface ServerConfig {
    command: string;
    args: string[];
    retry?: retry.Options;
  }

  export interface StdioServerConfig {
    type: "stdio";
    command: string;
    args: string[];
  }

  /** An MCP tool call, as split out of a recorded tool use name. */
  export interface Call {
    server: string;
    tool: string;
  }
}

/**
 * The MCP servers a scenario can use next to Alumnium itself.
 *
 * The same servers are handed to Claude Code while recording and connected to
 * while playing back, so that a recorded call to one of their tools can be made
 * again without an agent turn.
 */
export class ScenarioExternalMcp {
  static #servers: Record<string, ScenarioExternalMcp.ServerConfig> = {
    "qe-test-data-mcp": {
      command: "handshake",
      args: [
        "mcp-proxy",
        "--backend",
        "https://qe-test-data-mcp-staging.a.musta.ch/mcp",
      ],
      retry: EXPONENTIAL_RETRY,
    },
  };

  /**
   * Server definitions in the shape the Claude Code SDK takes them.
   */
  static mcpServers(): Record<string, ScenarioExternalMcp.StdioServerConfig> {
    return Object.fromEntries(
      Object.entries(this.#servers).map(([name, { command, args }]) => [
        name,
        { type: "stdio", command, args },
      ]),
    );
  }

  /**
   * Tool name patterns that allow the agent to call every configured server.
   */
  static allowedTools(): string[] {
    return Object.keys(this.#servers).map(
      (name) => `${TOOL_USE_NAME_PREFIX}${name}${TOOL_USE_NAME_SEPARATOR}*`,
    );
  }

  /**
   * Tells whether a recorded tool use name is an MCP tool call at all,
   * regardless of whether its server is configured here.
   *
   * @param toolUseName - Tool name as recorded, e.g. `mcp__server__tool`.
   */
  static isToolUseName(toolUseName: string): boolean {
    return TOOL_USE_NAME_PATTERN.test(toolUseName);
  }

  /**
   * Splits a recorded tool use name into the server and tool it names.
   *
   * @param toolUseName - Tool name as recorded, e.g. `mcp__server__tool`.
   * @returns The call, `null` when the name isn't an MCP tool of a configured
   *   server.
   */
  static parseToolUseName(
    toolUseName: string,
  ): ScenarioExternalMcp.Call | null {
    for (const server of Object.keys(this.#servers)) {
      const prefix = `${TOOL_USE_NAME_PREFIX}${server}${TOOL_USE_NAME_SEPARATOR}`;
      if (!toolUseName.startsWith(prefix)) continue;

      const tool = toolUseName.slice(prefix.length);
      if (tool) return { server, tool };
    }

    return null;
  }

  // Server name -> connected client, so that a scenario calling the same server
  // repeatedly spawns it once.
  #clients = new Map<string, Client>();

  /**
   * Calls a tool on an external MCP server, connecting to it on first use.
   *
   * A server configured with `retry` has its failing calls repeated with an
   * exponential back-off, both when the call itself throws - a server that is
   * down or a connection that broke - and when it comes back as an error result.
   *
   * @param server - Configured server name.
   * @param tool - Tool name on that server, without the `mcp__` prefix.
   * @param input - Recorded tool input.
   * @returns Tool output, an error result once the retries are exhausted.
   */
  async call(
    server: string,
    tool: string,
    input: Record<string, unknown>,
  ): Promise<ScenarioExternalMcp.Output> {
    const options = ScenarioExternalMcp.#servers[server]?.retry;
    if (!options) return this.#call(server, tool, input);

    try {
      return await retry(options, async () => {
        const output = await this.#call(server, tool, input);
        if (output.isError) throw new ToolError(server, tool, output);
        return output;
      });
    } catch (error) {
      // NOTE: The last attempt returned an error result rather than throwing, so
      // it is handed back as the call's output. Reporting the failure is up to
      // the caller, which has the recorded call at hand to name it by.
      if (error instanceof ToolError) return error.output;
      throw error;
    }
  }

  /**
   * Closes every server connected so far.
   *
   * NOTE: Never throws, so that a server failing to shut down cannot leave
   * another one - or the Alumnium server itself - running.
   */
  async close() {
    for (const [server, client] of this.#clients) {
      try {
        await client.close();
      } catch (error) {
        logger.warn(`Failed to close MCP server '${server}': ${error}`);
      }
    }

    this.#clients.clear();
  }

  /**
   * Makes a single attempt at a tool call, connecting to the server when needed.
   */
  async #call(
    server: string,
    tool: string,
    input: Record<string, unknown>,
  ): Promise<ScenarioExternalMcp.Output> {
    const client = await this.#client(server);

    logger.debug(`Calling MCP tool '${tool}' on '${server}' with: {input}`, {
      input,
    });

    const output = await client.callTool({ name: tool, arguments: input });

    logger.debug(`MCP tool '${tool}' on '${server}' result: {output}`, {
      output,
    });

    return output;
  }

  async #client(server: string): Promise<Client> {
    const connected = this.#clients.get(server);
    if (connected) return connected;

    const config = ScenarioExternalMcp.#servers[server];
    if (!config)
      throw new Error(`MCP server '${server}' is not configured for playback`);

    logger.debug(`Connecting to MCP server '${server}'`);

    const client = new Client({
      name: "alumnium-runner",
      version: "1.0.0",
    });
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      // oxlint-disable-next-line no-process-env
      env: process.env as any,
    });

    // NOTE: A server that exited is dropped from the connected ones, so that the
    // next call - a retry of the one that just broke, or a later one - spawns it
    // again instead of talking to a closed transport.
    client.onclose = () => {
      logger.debug(`MCP server '${server}' closed the connection`);
      this.#clients.delete(server);
    };

    await client.connect(transport);
    this.#clients.set(server, client);

    return client;
  }
}

/**
 * A tool call that came back as an error result, in a shape `retry` can act on.
 *
 * NOTE: Never leaves `call`, which unwraps the output again once the retries are
 * exhausted.
 */
class ToolError extends Error {
  readonly output: ScenarioExternalMcp.Output;

  constructor(
    server: string,
    tool: string,
    output: ScenarioExternalMcp.Output,
  ) {
    const details = ScenarioAlumniumMcp.outputTexts(output.content).join("\n");
    super(
      `MCP tool '${tool}' on '${server}' returned an error: ${details || "no details"}`,
    );
    this.output = output;
  }
}
