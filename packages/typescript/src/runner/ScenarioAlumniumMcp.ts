import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import z from "zod";
import { Telemetry } from "../telemetry/Telemetry.ts";

const { logger } = Telemetry.get(import.meta.url);

const TOOL_USE_NAME_PREFIX = "mcp__alumnium__";

export namespace ScenarioAlumniumMcp {
  export type Input = z.infer<typeof ScenarioAlumniumMcp.Input>;

  export type Output = Awaited<ReturnType<Client["callTool"]>>;

  export type OutputContent = Output["content"];
}

export class ScenarioAlumniumMcp {
  static Input = z.record(z.string(), z.unknown());

  #client: Client;
  #transport: StdioClientTransport;

  constructor() {
    this.#client = new Client({ name: "alumnium-runner", version: "1.0.0" });

    this.#transport = new StdioClientTransport({
      command: "mise",
      args: ["//:dev/mcp"],
      // oxlint-disable-next-line no-process-env
      env: process.env as any,
    });
  }

  connect() {
    return this.#client.connect(this.#transport);
  }

  close() {
    return this.#client.close();
  }

  async call(
    name: string,
    input: Record<string, unknown>,
  ): Promise<ScenarioAlumniumMcp.Output> {
    logger.debug(`Calling MCP tool '${name}' with: {input}`, { input });

    const result = await this.#client.callTool({
      name,
      arguments: input,
    });

    logger.debug(`MCP tool '${name}' result: {result}`, { result });
    return result;
  }

  convertNameFromToolUse(toolUseName: string) {
    return toolUseName.replace(TOOL_USE_NAME_PREFIX, "");
  }

  static isOwnToolUseName(toolUseName: string) {
    return toolUseName.startsWith(TOOL_USE_NAME_PREFIX);
  }

  static parseInput(value: unknown): ScenarioAlumniumMcp.Input {
    const parseResult = ScenarioAlumniumMcp.Input.safeParse(value);
    if (!parseResult.success) {
      const message = "Invalid tool input, expected an object";
      logger.error(message);
      throw new Error(message);
    }
    return parseResult.data;
  }
}
