import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { always } from "alwaysly";
import z from "zod";
import { isSingleFileExecutable } from "../bundle.ts";
import { Telemetry } from "../telemetry/Telemetry.ts";

const { logger } = Telemetry.get(import.meta.url);

const TOOL_USE_NAME_PREFIX = "mcp__alumnium__";

export namespace ScenarioAlumniumMcp {
  export type Input = z.infer<typeof ScenarioAlumniumMcp.Input>;

  export type Output = Awaited<ReturnType<Client["callTool"]>>;

  export type OutputContent = Output["content"];

  export interface SpawnCommand {
    command: string;
    args: string[];
  }
}

export class ScenarioAlumniumMcp {
  static Input = z.record(z.string(), z.unknown());

  static TextBlock = z.object({ type: z.literal("text"), text: z.string() });

  /**
   * Collects the text of a tool output, which is either a bare string or a list
   * of content blocks.
   *
   * @param content - Tool output content.
   * @returns Text of every text block, in order.
   */
  static outputTexts(content: unknown): string[] {
    if (typeof content === "string") return [content];
    if (!Array.isArray(content)) return [];

    return content.flatMap((block) => {
      const parseResult = ScenarioAlumniumMcp.TextBlock.safeParse(block);
      return parseResult.success ? [parseResult.data.text] : [];
    });
  }

  #client: Client;
  #transport: StdioClientTransport;

  constructor() {
    this.#client = new Client({ name: "alumnium-runner", version: "1.0.0" });

    const { command, args } = ScenarioAlumniumMcp.spawnCommand();
    this.#transport = new StdioClientTransport({
      command,
      args,
      // oxlint-disable-next-line no-process-env
      env: process.env as any,
    });
  }

  static spawnCommand(): ScenarioAlumniumMcp.SpawnCommand {
    // NOTE: In a single-file executable `process.execPath` is the Alumnium
    // binary itself, so the command name is the only argument needed.
    if (isSingleFileExecutable())
      return { command: process.execPath, args: ["mcp"] };

    const scriptPath = process.argv[1];
    always(scriptPath);

    return {
      command: process.execPath,
      args: [scriptPath, "mcp"],
    };
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

  static convertNameFromToolUse(toolUseName: string) {
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
