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
import { type CacheLookups, createCacheLookups } from "../llm/llmSchema.ts";
import { parseMcpCacheLookupsOutput } from "../mcp/mcpCacheLookups.ts";
import { SystemProcess } from "../system/SystemProcess.ts";
import { Telemetry } from "../telemetry/Telemetry.ts";
import { TypeUtils } from "../typeUtils.ts";
import { Scenario } from "./Scenario.ts";
import { ScenarioAlumniumMcp } from "./ScenarioAlumniumMcp.ts";
import { ScenarioClaudeCodeSessionStore } from "./ScenarioClaudeCodeSessionStore.ts";
import { ScenarioExternalMcp } from "./ScenarioExternalMcp.ts";
import { ScenarioMasker } from "./ScenarioMasker.ts";
import type { ScenarioPlayer } from "./ScenarioPlayer.ts";
import { ScenarioReporter } from "./ScenarioReporter.ts";

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
    kind: Scenario.ClaudeCodeStep["kind"];
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
  // NOTE: Keyed by tool use id, since the agent can run tools in parallel.
  #pendingUses = new Map<string, ScenarioRecorder.StepBuffer>();
  #externalCallsCount = 0;
  #masker = new ScenarioMasker();
  #recovery: ScenarioRecorder.Recovery | undefined;
  #sessionStore: ScenarioClaudeCodeSessionStore;
  #sessionId: string | undefined;
  #lookups = createCacheLookups();

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

  /**
   * Cache lookups made by the recorded session, as reported by the `stop` tool.
   *
   * NOTE: Unlike the playback, the recording can only report the session totals
   * and not per-step counters: the agent runs the MCP tools, and the Claude Code
   * SDK doesn't pass a tool result's `_meta` through to its consumers.
   */
  get lookups(): CacheLookups {
    return { ...this.#lookups };
  }

  //#region Recording

  async record(): Promise<ScenarioRecorder.Result> {
    const claude = await this.#claudeCode();

    try {
      const prompt = `
You are a test agent that runs a test scenario with Alumnium.

You will run the scenario step by step, using do, check, get, and other MCP tools to perform the scenario.
You will report any errors that occur during the scenario.

After reading the scenario, create an internal todo list to track execution and ensure you're on track. Complete each step before moving on to the next.

When using a do tool, use placeholders for any values that look like parameters.
Consider the following two steps:
1. do(goal: 'type test1@email.com to the email field')
2. do(goal: 'type test2@email.com to the email field')
Instead of hardcoding the email addresses, you should use a parameterized approach, like this:
1. do(goal: 'type {email} to the email field', params: {"email": "test1@email.com"})
2. do(goal: 'type {email} to the email field', params: {"email": "test2@email.com"})
This maximizes the reusability of the scenarios and individual steps, improve test performance.
Only do tool call supports placeholders, other tools should be called with the actual values.

When a value an Alumnium tool needs comes from another tool (Bash, Read), make that tool print a
JSON object with a named key for each value, and pass the value on unchanged.
Consider generating a random number to type into a field:
1. Bash(command: 'echo "{\\"number\\": $((RANDOM % 10 + 1))}"') -> {"number": 7}
2. do(goal: 'type {number} into the amount field', params: {"number": "7"})
Values are only refreshed on a later run when the tool that produced them printed JSON and the
value reaches the Alumnium tool as a whole \`params\` value. A value inlined into the goal text,
reformatted, or computed by you cannot be refreshed, so the next run will replay the recorded one.

The scenario is provided below.
---
${this.#scenario.text}
`;
      for await (const message of claude.query(prompt)) {
        logger.debug("Received Claude Code message: {message}", { message });

        this.#processMessage(message);
      }
    } finally {
      this.#closeClaudeCode(claude);
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
      switch (block.type) {
        case "thinking":
          return ScenarioReporter.thinking(block.thinking);

        case "text":
          return ScenarioReporter.assistant(block.text);

        case "tool_use":
          ScenarioReporter.toolUse(block.name, block.input);
          return this.#recordToolUse(block);
      }
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
          // NOTE: Claude Code shuts the server down the same way the runner
          // does, so it has to be a direct child process too. See
          // `ScenarioAlumniumMcp.spawnCommand`.
          alumnium: {
            type: "stdio",
            ...ScenarioAlumniumMcp.spawnCommand(),
          },
          // NOTE: The same servers the playback connects to, so that every tool
          // the agent can call here can be called again without an agent turn.
          ...ScenarioExternalMcp.mcpServers(),
        },
        allowedTools: [
          "Read",
          "Write",
          "Edit",
          "Bash",
          "mcp__alumnium__*",
          ...ScenarioExternalMcp.allowedTools(),
        ],
        thinking: { type: "adaptive", display: "summarized" },
        settingSources: [],
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

  #closeClaudeCode(claude: WarmQuery) {
    logger.debug("Closing Claude Code subprocess");

    try {
      claude.close();
    } catch (error) {
      logger.warn(`Failed to close Claude Code subprocess: ${error}`);
    }
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
    const isOwn = ScenarioAlumniumMcp.isOwnToolUseName(toolUse.name);

    logger.debug(`Recording tool use: {toolUse}`, { toolUse });

    this.#pendingUses.set(toolUse.id, {
      kind: isOwn ? "tool-use" : "external-tool-use",
      agent: "claude-code",
      use: this.#maskToolUse(toolUse, isOwn),
    });
  }

  /**
   * Masks the values earlier external calls produced in a tool input.
   *
   * An MCP tool input is masked where a value is a whole input value, an
   * external tool input also where a quote pair delimits one - which is what
   * keeps e.g. a shell command intact while still refreshing the value in it.
   *
   * NOTE: Masking belongs here, on the tool use, and not where the step is
   * pushed in `#recordToolResult`. An external call's output is only registered
   * once its result arrives, so a call can neither mask its own input, nor -
   * when the agent runs tools in parallel - be masked with a value that did not
   * exist yet when it was issued.
   *
   * NOTE: An external tool playback cannot execute (`Write`, `Edit`) is masked
   * too. Its input is never re-run, so nothing gets substituted back into it,
   * but masking still keeps the value a recording happened to produce - often a
   * credential - out of the stored scenario. Only a tool whose input is prose is
   * left verbatim, see `ScenarioMasker.masksToolInput`.
   *
   * @param toolUse - Tool use to mask, left untouched.
   * @param isOwn - Whether the tool is one of Alumnium's own MCP tools.
   * @returns Masked copy of the tool use.
   */
  #maskToolUse(
    toolUse: Scenario.ClaudeCodeStepToolUse,
    isOwn: boolean,
  ): Scenario.ClaudeCodeStepToolUse {
    if (!isOwn && !ScenarioMasker.masksToolInput(toolUse.name)) return toolUse;

    const maskedToolUse = structuredClone(toolUse);
    maskedToolUse.input = isOwn
      ? this.#masker.maskInput(maskedToolUse.input)
      : this.#masker.maskExternalToolInput(maskedToolUse.input);

    return maskedToolUse;
  }

  //#endregion

  //#region Tool result

  #recordToolResult(toolResult: Scenario.ClaudeCodeStepToolResult) {
    const pending = this.#pendingUses.get(toolResult.tool_use_id);
    if (!pending) {
      logger.debug(
        `No recorded tool use for result '${toolResult.tool_use_id}', ignoring tool result`,
      );
      return;
    }

    this.#pendingUses.delete(toolResult.tool_use_id);

    logger.info(`Recording '${pending.use.name}' tool result`);
    logger.debug(`-> Result: {toolResult}`, { toolResult });

    if (pending.kind === "external-tool-use") {
      this.#scenario.steps.push({
        kind: "external-tool-use",
        use: pending.use,
        result: toolResult,
      });

      ScenarioReporter.toolResult(pending.use.name, toolResult.content);

      // NOTE: Registered after the step is recorded, so that the values are
      // masked in the MCP tool inputs that follow, not in this call's own input.
      this.#masker.registerExternalOutput(
        this.#externalCallsCount++,
        toolResult.content,
      );
      return;
    }

    this.#scenario.steps.push({
      kind: "tool-use",
      use: pending.use,
      result: this.#maskToolResult(toolResult),
    });

    // NOTE: Reported unmasked, so that what the tool actually returned is what
    // the user sees.
    ScenarioReporter.toolResult(pending.use.name, toolResult.content);

    this.#accumulateCacheLookups(toolResult);
  }

  /**
   * Accumulates the cache lookups an MCP tool result reports, if any.
   *
   * @param toolResult - MCP tool result to read the counters from.
   */
  #accumulateCacheLookups(toolResult: Scenario.ClaudeCodeStepToolResult) {
    const { content } = toolResult;
    const texts =
      typeof content === "string"
        ? [content]
        : (content ?? []).map((block) =>
            block.type === "text" ? block.text : "",
          );

    texts.forEach((text) => {
      const lookups = parseMcpCacheLookupsOutput(text);
      if (!lookups) return;

      logger.debug(`Recorded cache lookups: {lookups}`, { lookups });
      this.#lookups.hits += lookups.hits;
      this.#lookups.misses += lookups.misses;
    });
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
