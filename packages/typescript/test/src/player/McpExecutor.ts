import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { ALUMNIUM_VERSION, Telemetry } from "@alumnium/core/internal";
import { Recording } from "../Recording.ts";
import type { ToolExecutor } from "./ToolExecutor.ts";

const { logger } = Telemetry.get(import.meta.url);

const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 1000;

export namespace McpExecutor {
  export interface StdioServer {
    type?: "stdio" | undefined;
    command: string;
    args?: string[] | undefined;
    env?: Record<string, string> | undefined;
    cwd?: string | undefined;
  }

  export interface HttpServer {
    type: "http";
    url: string;
    headers?: Record<string, string> | undefined;
  }

  export interface ClientServer {
    type: "client";
    client: Client;
  }

  export type Server = StdioServer | HttpServer | ClientServer;

  export interface Props {
    servers: Record<string, Server>;
    retries?: number | undefined;
    retryDelayMs?: number | undefined;
  }
}

export class McpExecutor implements ToolExecutor {
  #servers: Record<string, McpExecutor.Server>;
  #retries: number;
  #retryDelayMs: number;
  #clients = new Map<string, Promise<Client>>();

  constructor(props: McpExecutor.Props) {
    this.#servers = props.servers;
    this.#retries = props.retries ?? DEFAULT_RETRIES;
    this.#retryDelayMs = props.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  }

  handles(call: ToolExecutor.Call): boolean {
    return Boolean(call.server && call.server in this.#servers);
  }

  async execute(
    call: ToolExecutor.Call,
    options: ToolExecutor.ExecuteOptions = {},
  ): Promise<Recording.ToolResult> {
    const toolKey = Recording.toolKey(call);
    const client = await this.#client(call.server!);

    for (let attempt = 0; ; attempt++) {
      const canRetry = attempt < this.#retries;
      const delayMs = this.#retryDelayMs * 2 ** attempt;

      try {
        const result = await client.callTool({
          name: call.tool,
          arguments: call.input,
          ...(options.meta ? { _meta: options.meta } : {}),
        });

        const toolResult: Recording.ToolResult = {
          content: (result.content ?? []) as Recording.Content,
          isError: Boolean(result.isError),
        };
        if (!toolResult.isError || !canRetry) return toolResult;

        logger.warn(`Tool '${toolKey}' reported an error, retrying`);
      } catch (error) {
        if (!canRetry) throw error;

        logger.warn(`Tool '${toolKey}' failed, retrying: {error}`, { error });
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  async close(): Promise<void> {
    const clients = [...this.#clients];
    this.#clients.clear();

    await Promise.all(
      clients.map(async ([name, client]) => {
        // A client the host connected is the host's to close.
        if (this.#servers[name]?.type === "client") return;

        try {
          await (await client).close();
        } catch (error) {
          logger.warn(`Failed to close MCP server '${name}': {error}`, {
            error,
          });
        }
      }),
    );
  }

  #client(name: string): Promise<Client> {
    let client = this.#clients.get(name);
    if (!client) {
      client = this.#connect(name);
      // A failed connection is retried on the next call.
      client.catch(() => this.#clients.delete(name));
      this.#clients.set(name, client);
    }
    return client;
  }

  async #connect(name: string): Promise<Client> {
    const server = this.#servers[name];
    if (!server) throw new Error(`Unknown MCP server '${name}'`);
    if (server.type === "client") return server.client;

    logger.debug(`Connecting to MCP server '${name}'`);

    const transport: Transport =
      server.type === "http"
        ? // Its optional `sessionId` breaks `exactOptionalPropertyTypes`.
          (new StreamableHTTPClientTransport(new URL(server.url), {
            requestInit: { headers: server.headers ?? {} },
          }) as Transport)
        : new StdioClientTransport({
            command: server.command,
            args: server.args ?? [],
            env: { ...this.#definedEnv(), ...server.env },
            ...(server.cwd ? { cwd: server.cwd } : {}),
            stderr: "inherit",
          });

    const client = new Client({
      name: "alumnium-test-player",
      version: ALUMNIUM_VERSION,
    });
    await client.connect(transport);
    return client;
  }

  #definedEnv(): Record<string, string> {
    return Object.fromEntries(
      // oxlint-disable-next-line node/no-process-env -- Servers inherit it
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    );
  }
}
