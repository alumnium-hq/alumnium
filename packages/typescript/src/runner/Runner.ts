import {
  query,
  type SDKUserMessage,
  type SDKUserMessageReplay,
} from "@anthropic-ai/claude-agent-sdk";
import type { ToolResultBlockParam } from "@anthropic-ai/sdk/resources";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { $ } from "bun";
import fs from "node:fs/promises";
import z from "zod";
import { McpTool } from "../mcp/tools/McpTool.ts";
import { SystemProcess } from "../system/SystemProcess.ts";
import { Telemetry } from "../telemetry/Telemetry.ts";
import { Scenario } from "./Scenario.ts";
import { ScenarioRecording } from "./ScenarioRecording.ts";
import { ScenariosStore } from "./ScenariosStore.ts";

const { logger } = Telemetry.get(import.meta.url);

const MCP_TOOL_PREFIX = "mcp__alumnium__";
const START_MCP_TOOL_NAME = "start";

export namespace Runner {
  export type ToolArguments = z.infer<typeof Runner.ToolArguments>;

  export type MaskMap = Record<string, string>;
}

export class Runner {
  static ToolArguments = z.record(z.string(), z.unknown());

  #path: string;
  #store = new ScenariosStore();

  constructor(path: string) {
    this.#path = path;
  }

  async run() {
    logger.info(`Running scenario ${this.#path}`);

    const text = await this.#readScenarioText();
    if (!text) {
      logger.error(
        `Failed to read scenario file at ${this.#path}. Please check the path is correct.`,
      );
      return SystemProcess.exit(1);
    }

    const scenario = await this.#store.lookup(text);

    if (scenario) {
      logger.info(`Scenario ${scenario.id} found in the store, playing...`);
      await this.#play(scenario);
    } else {
      logger.info(`Scenario not found in the store, recording...`);
      await this.#record(text);
    }
  }

  async #play(scenario: Scenario.Type) {
    const fromMaskMap: Record<string, string> = {};
    const client = new Client({ name: "alumnium-runner", version: "1.0.0" });
    const transport = new StdioClientTransport({
      command: "mise",
      args: ["//:dev/mcp"],
      // oxlint-disable-next-line no-process-env
      env: process.env as any,
    });

    try {
      await client.connect(transport);

      for (const step of scenario.steps) {
        const { toolUse } = step;
        const name = toolUse.name.replace(MCP_TOOL_PREFIX, "");
        const input = this.#unmaskToolInput(toolUse.input, fromMaskMap);

        logger.debug(`Playing MCP tool ${name} with: {input}`, { input });

        const result = await client.callTool({
          name,
          arguments: input,
        });

        logger.debug("MCP tool result: {result}", { result });

        if (name === START_MCP_TOOL_NAME) {
          const id = this.#extractDriverId(result as any);
          if (id) fromMaskMap[this.#deriveMask(fromMaskMap)] = id;
        }
      }
    } finally {
      await client.close();
    }
  }

  async #record(text: string) {
    const pendingToolUses: Record<string, string> = {};
    const toMaskMap: Record<string, string> = {};

    const claudeCodePath = await this.#claudeCodePath();
    if (!claudeCodePath) {
      logger.error(
        "Claude Code binary not found. Please install Claude Code to run the scenario.",
      );
      return SystemProcess.exit(1);
    }

    const recording = new ScenarioRecording({
      text,
      path: this.#path,
    });

    for await (const message of query({
      prompt: text,
      options: {
        pathToClaudeCodeExecutable: claudeCodePath,
        mcpServers: {
          alumnium: {
            type: "stdio",
            command: "mise",
            args: ["//:dev/mcp"],
          },
        },
        allowedTools: ["Read", "Write", "Edit", "Bash", "mcp__alumnium__*"],
      },
    })) {
      logger.debug("Claude Code message: {message}", { message });

      if (message.type === "user") {
        this.#updateToMaskMap(message, pendingToolUses, toMaskMap);
        continue;
      }

      if (message.type !== "assistant") continue;

      const toolUses = message.message.content.filter(
        (block): block is Scenario.ClaudeCodeStepToolUse =>
          block.type === "tool_use" && block.name.startsWith(MCP_TOOL_PREFIX),
      );

      toolUses.forEach((toolUse) => {
        pendingToolUses[toolUse.id] = toolUse.name;
        recording.recordToolUse(this.#maskToolUse(toolUse, toMaskMap));
      });

      if (toolUses.length)
        logger.debug(`Recorded ${toolUses.length} tool uses: {toolUses}`, {
          toolUses,
        });
    }

    const path = await this.#store.save(recording.scenario);

    logger.info(`Saved scenario recording to ${path}`);
  }

  async #readScenarioText(): Promise<string | null> {
    try {
      return fs.readFile(this.#path, "utf-8");
    } catch (error) {
      logger.warn(`Failed to read scenario file at ${this.#path}: ${error}`);
      return null;
    }
  }

  async #claudeCodePath(): Promise<string | null> {
    try {
      const whichClaudeCodeOutput = await $`which claude`.quiet();
      const claudeCodePath = whichClaudeCodeOutput.text().trim();
      logger.debug(`Found Claude Code binary at ${claudeCodePath}`);
      return claudeCodePath;
    } catch (error) {
      logger.debug(`Failed to find Claude Code binary: ${error}`);
      return null;
    }
  }

  #updateToMaskMap(
    message: SDKUserMessage | SDKUserMessageReplay,
    pendingToolUses: Record<string, string>,
    toMaskMap: Runner.MaskMap,
  ) {
    if (!Array.isArray(message.message.content)) return;

    for (const block of message.message.content) {
      if (block.type !== "tool_result") continue;

      const toolName = pendingToolUses[block.tool_use_id];
      delete pendingToolUses[block.tool_use_id];
      if (toolName !== `${MCP_TOOL_PREFIX}${START_MCP_TOOL_NAME}`) continue;

      const id = this.#extractDriverId(block);
      if (id) toMaskMap[id] = this.#deriveMask(toMaskMap);
    }
  }

  #maskToolUse(
    toolUse: Scenario.ClaudeCodeStepToolUse,
    toMaskMap: Record<string, string>,
  ) {
    const maskedToolUse = structuredClone(
      toolUse,
    ) as Scenario.ClaudeCodeStepToolUse;
    const input = maskedToolUse.input;
    if (!this.#isRecord(input)) return maskedToolUse;

    const inputParseResult = McpTool.WithDriverId.safeParse(input);
    if (!inputParseResult.success) return maskedToolUse;

    const { id } = inputParseResult.data;
    const mask = toMaskMap[id];
    if (!mask) {
      logger.warn(`No driver id mask found for ${id}`);
      return maskedToolUse;
    }

    Object.assign(input, { id: mask });
    return maskedToolUse;
  }

  #unmaskToolInput(
    input: unknown,
    fromMaskMap: Runner.MaskMap,
  ): Runner.ToolArguments {
    const unmaskedInput = structuredClone(Runner.ToolArguments.parse(input));

    const withDriverIdResult = McpTool.WithDriverId.safeParse(unmaskedInput);

    if (!withDriverIdResult.success) return unmaskedInput;

    const mask = withDriverIdResult.data.id;
    const id = fromMaskMap[mask];
    if (!id) {
      logger.warn(`No driver id found for mask ${mask}`);
      return unmaskedInput;
    }

    Object.assign(unmaskedInput, { id });
    return unmaskedInput;
  }

  #extractDriverId(block: ToolResultBlockParam): string | null {
    for (const text of this.#extractTextBlocks(block)) {
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {}

      const result = McpTool.WithDriverId.safeParse(data);
      if (result.success) return result.data.id;
    }

    return null;
  }

  #extractTextBlocks(block: ToolResultBlockParam): string[] {
    if (!block.content) return [];
    if (typeof block.content === "string") return [block.content];
    return block.content.flatMap((block) => {
      if (block.type !== "text") return [];
      return [block.text];
    });
  }

  #isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  #deriveMask(maskMap: Runner.MaskMap) {
    return `<MASKED_${Object.keys(maskMap).length}>`;
  }
}
