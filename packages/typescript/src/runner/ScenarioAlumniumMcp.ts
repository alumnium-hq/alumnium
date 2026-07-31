import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { always } from "alwaysly";
import z from "zod";
import { isSingleFileExecutable } from "../bundle.ts";
import { mcpNoCacheMeta } from "../mcp/mcpNoCache.ts";
import { Telemetry } from "../telemetry/Telemetry.ts";
import { jsonString } from "../utils/schema.ts";

const { logger } = Telemetry.get(import.meta.url);

const TOOL_USE_NAME_PREFIX = "mcp__alumnium__";

export namespace ScenarioAlumniumMcp {
  export type Input = z.infer<typeof ScenarioAlumniumMcp.Input>;

  export type Output = Awaited<ReturnType<Client["callTool"]>>;

  export type OutputContent = Output["content"];

  export type DoOutput = z.infer<typeof ScenarioAlumniumMcp.DoOutput>;

  export type CheckOutput = z.infer<typeof ScenarioAlumniumMcp.CheckOutput>;

  export interface SpawnCommand {
    command: string;
    args: string[];
  }

  export interface CallOptions {
    /**
     * Have the tool generate its LLM responses afresh, skipping the response
     * cache.
     *
     * NOTE: Travels in the request `_meta`, not the tool input, so it never lands
     * in a recording. See `mcpNoCache`.
     */
    noCache?: boolean | undefined;
  }
}

export class ScenarioAlumniumMcp {
  static TIMEOUT: number = 300_000; // 5 minutes

  static Input = z.record(z.string(), z.unknown());

  static TextBlock = z.object({ type: z.literal("text"), text: z.string() });

  // NOTE: Both outputs are what the tools return today (see `doMcpTool` and
  // `checkMcpTool`), and are only used to present them. Everything optional, so
  // that a changed output degrades to being printed raw rather than throwing.
  static DoOutput = jsonString(
    z.object({
      explanation: z.string().optional(),
      performed_steps: z
        .array(
          z.object({
            name: z.string(),
            tools: z.array(z.string()).optional(),
          }),
        )
        .optional(),
      changes: z.string().optional(),
    }),
  );

  static CheckOutput = jsonString(
    z.object({
      result: z.string(),
      explanation: z.string().optional(),
    }),
  );

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

  /**
   * @param name - Tool to call.
   * @param input - Tool input.
   * @param options - Per-call switches, passed in the request `_meta`.
   * @returns What the tool returned, including a failed call - `callTool` only
   *   throws on a transport error.
   */
  async call(
    name: string,
    input: Record<string, unknown>,
    options: ScenarioAlumniumMcp.CallOptions = {},
  ): Promise<ScenarioAlumniumMcp.Output> {
    logger.debug(`Calling MCP tool '${name}' with: {input}`, { input });

    const result = await this.#client.callTool(
      {
        name,
        arguments: input,
        // NOTE: A server that doesn't know the key ignores it, which degrades to
        // today's behavior rather than to a wrong answer: a confirmation is then
        // served from the cache, agrees with itself, and the disagreement it was
        // sent to question stands.
        ...(options.noCache ? { _meta: mcpNoCacheMeta() } : {}),
      },
      undefined,
      { timeout: ScenarioAlumniumMcp.TIMEOUT },
    );

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
