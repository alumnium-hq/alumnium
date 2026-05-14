import {
  startup,
  type Options,
  type SDKAssistantMessage,
  type SDKMessage,
  type SDKResultMessage,
  type SDKUserMessage,
  type SDKUserMessageReplay,
  type WarmQuery,
} from "@anthropic-ai/claude-agent-sdk";
import { $ } from "bun";
import { txts } from "smollit";
import { SystemProcess } from "../system/SystemProcess.ts";
import { Telemetry } from "../telemetry/Telemetry.ts";
import { TypeUtils } from "../typeUtils.ts";
import { Scenario } from "./Scenario.ts";
import { ScenarioAlumniumMcp } from "./ScenarioAlumniumMcp.ts";
import { ScenarioClaudeCodeSessionStore } from "./ScenarioClaudeCodeSessionStore.ts";
import { ScenarioMasker } from "./ScenarioMasker.ts";
import type { ScenarioPlayer } from "./ScenarioPlayer.ts";

const { logger } = Telemetry.get(import.meta.url);

export namespace ScenarioRecorder {
  export interface Props {
    text: string;
    path: string;
    recovery?: ScenarioRecorder.Recovery | undefined;
  }

  export interface Recovery {
    session: ScenarioClaudeCodeSessionStore.Snapshot;
    logs: ScenarioPlayer.Log[];
  }

  export interface StepBufferClaudeCodeToolUse {
    kind: "tool-use";
    agent: "claude-code";
    use: Scenario.ClaudeCodeStepToolUse;
  }

  export type StepBuffer = StepBufferClaudeCodeToolUse;

  export interface ResultSuccess {
    status: "success";
    session: ScenarioClaudeCodeSessionStore.Snapshot;
  }

  export interface ResultFailure {
    status: "failure";
    error: string;
  }

  export type Result = ResultSuccess | ResultFailure;
}

export class ScenarioRecorder {
  #scenario: Scenario.Type;
  #buffer: ScenarioRecorder.StepBuffer | undefined;
  #masker = new ScenarioMasker();
  #recovery: ScenarioRecorder.Recovery | undefined;
  #sessionStore: ScenarioClaudeCodeSessionStore;
  #sessionId: string | undefined;

  constructor(props: ScenarioRecorder.Props) {
    const { text, path, recovery } = props;
    const id = Scenario.textToId(text);
    this.#scenario = {
      agent: "claude-code",
      steps: [],
      id,
      text,
      path,
    };

    this.#recovery = recovery;
    this.#sessionStore = new ScenarioClaudeCodeSessionStore(recovery?.session);
    this.#sessionId = recovery?.session?.sessionId;
  }

  get scenario(): Scenario.Type {
    return this.#scenario;
  }

  //#region Recording

  async record(): Promise<ScenarioRecorder.Result> {
    const claude = await this.#claudeCode();

    for await (const message of claude.query(this.#scenario.text)) {
      logger.debug("Received Claude Code message: {message}", { message });

      this.#processMessage(message);
    }

    if (!this.#sessionId)
      return {
        status: "failure",
        error: "No Claude Code SDK session ID received from Claude Code",
      };

    const session = this.#sessionStore.snapshot(this.#sessionId);

    return {
      status: "success",
      session,
    };
  }

  #processMessage(message: SDKMessage) {
    switch (message.type) {
      case "assistant":
        return this.#processAssistantMessage(message);

      case "user":
        return this.#processUserMessage(message);

      case "result":
        return this.#processResultMessage(message);
    }
  }

  #processAssistantMessage(message: SDKAssistantMessage) {
    message.message.content.forEach((block) => {
      if (
        block.type !== "tool_use" ||
        !ScenarioAlumniumMcp.isOwnToolUseName(block.name)
      )
        return;
      this.#recordToolUse(block);
    });
  }

  #processUserMessage(message: SDKUserMessage | SDKUserMessageReplay) {
    if (!Array.isArray(message.message.content)) return;
    message.message.content.forEach((block) => {
      if (block.type !== "tool_result") return;
      this.#recordToolResult(block);
    });
  }

  #processResultMessage(message: SDKResultMessage) {
    this.#sessionId = message.session_id;
  }

  //#endregion

  //#region Claude Code

  async #claudeCode(): Promise<WarmQuery> {
    const claudeCodePath = await this.#claudeCodePath();
    return startup({
      options: TypeUtils.fromExactOptionalTypes<Options>({
        pathToClaudeCodeExecutable: claudeCodePath,
        mcpServers: {
          alumnium: {
            type: "stdio",
            command: "mise",
            args: ["//:dev/mcp"],
          },
        },
        allowedTools: ["Read", "Write", "Edit", "Bash", "mcp__alumnium__*"],
        sessionStore: this.#sessionStore,
        sessionStoreFlush: "eager",
        systemPrompt: {
          type: "preset",
          preset: "claude_code",
          append: txts(
            this.#recovery &&
              `
              The saved Alumnium scenario playback failed and must be recovered.

              Start from scratch and record a new set of steps that passes
              the original scenario. Use the playback failure details below to
              understand what went stale, but do not try to continue from
              the failed playback state.

              Original scenario:

              ${this.#scenario.text}

              Playback logs::

              ${JSON.stringify(this.#recovery.logs, null, 2)}
            `,
            `
              If the test is successful, make sure to pass \`"save_cache": true\`
              to the \`mcp__alumnium__stop\` tool to save the cache for future
              test runs.
            `,
          ),
        },
        resume: this.#sessionId,
      }),
    });
  }

  async #claudeCodePath(): Promise<string> {
    try {
      const whichClaudeCodeOutput = await $`which claude`.quiet();
      const claudeCodePath = whichClaudeCodeOutput.text().trim();
      logger.debug(`Found Claude Code binary at ${claudeCodePath}`);

      return claudeCodePath;
    } catch (error) {
      logger.debug(`Failed to find Claude Code binary: ${error}`);
      logger.error(
        "Claude Code binary not found. Please install Claude Code to run the scenario.",
      );

      return SystemProcess.exit(1);
    }
  }

  //#endregion

  //#region Tool use

  #recordToolUse(toolUse: Scenario.ClaudeCodeStepToolUse) {
    if (this.#buffer) {
      const message = "The scenario recording buffer is not empty";
      logger.error(`${message}: {buffer}`, { buffer: this.#buffer });
      throw new Error(message);
    }

    logger.debug(`Recording tool use: {toolUse}`, { toolUse });

    this.#buffer = {
      kind: "tool-use",
      agent: "claude-code",
      use: this.#maskToolUse(toolUse),
    };
  }

  #maskToolUse(
    toolUse: Scenario.ClaudeCodeStepToolUse,
  ): Scenario.ClaudeCodeStepToolUse {
    const maskedToolUse = structuredClone(toolUse);
    maskedToolUse.input = this.#masker.maskInput(maskedToolUse.input);
    return maskedToolUse;
  }

  //#endregion

  //#region Tool result

  #recordToolResult(toolResult: Scenario.ClaudeCodeStepToolResult) {
    if (!this.#buffer) {
      logger.debug(
        "The scenario recording buffer is empty, ignoring tool result",
      );
      return;
    }

    if (this.#buffer.use.id !== toolResult.tool_use_id) {
      logger.debug(
        `The buffered tool use id '${this.#buffer.use.id}' does not match the provided tool result '${toolResult.tool_use_id}', ignoring tool result`,
      );
      return;
    }

    logger.info(`Recording '${this.#buffer.use.name}' tool result`);
    logger.debug(`-> Result: {toolResult}`, { toolResult });

    this.#scenario.steps.push({
      kind: "tool-use",
      use: this.#buffer.use,
      result: this.#maskToolResult(toolResult),
    });
    this.#buffer = undefined;
  }

  #maskToolResult(
    toolResult: Scenario.ClaudeCodeStepToolResult,
  ): Scenario.ClaudeCodeStepToolResult {
    const maskedToolResult = structuredClone(toolResult);

    const maskedContent = this.#masker.maskOutputContent(
      maskedToolResult.content,
    );
    if (maskedContent) maskedToolResult.content = maskedContent;

    return maskedToolResult;
  }

  //#endregion
}
