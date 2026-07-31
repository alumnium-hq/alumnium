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
import { ScenarioRecovery } from "./ScenarioRecovery.ts";
import { ScenarioReporter } from "./ScenarioReporter.ts";
import { ScenarioVerdict } from "./ScenarioVerdict.ts";

const { logger } = Telemetry.get(import.meta.url);

export namespace ScenarioRecorder {
  export interface Props {
    text: string;
    path: string;
    recovery?: ScenarioRecovery.Props | undefined;
  }

  export interface StepBufferClaudeCodeToolUse {
    kind: Scenario.ClaudeCodeStep["kind"];
    agent: "claude-code";
    use: Scenario.ClaudeCodeStepToolUse;
  }

  export type StepBuffer = StepBufferClaudeCodeToolUse;

  export interface ResultSuccess extends ScenarioVerdict.Type {
    status: "success";
    session: ScenarioClaudeCodeSessionStore.Snapshot;
  }

  export interface ResultFailure extends ScenarioVerdict.Type {
    status: "failure";
  }

  export type Result = ResultSuccess | ResultFailure;
}

export class ScenarioRecorder {
  #scenario: Scenario.Type;
  // NOTE: Keyed by tool use id, since the agent can run tools in parallel.
  #pendingUses = new Map<string, ScenarioRecorder.StepBuffer>();
  #externalCallsCount = 0;
  #masker = new ScenarioMasker();
  #recovery: ScenarioRecovery.Props | undefined;
  #sessionStore: ScenarioClaudeCodeSessionStore;
  #sessionId: string | undefined;
  #resultMessage: SDKResultMessage | undefined;
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
    // NOTE: Always empty, recovery or not, so that a recording is always a fresh
    // Claude Code session. See `ScenarioRecovery` for why a recovery does not
    // resume the session of the recording it replaces.
    this.#sessionStore = new ScenarioClaudeCodeSessionStore();
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
      for await (const message of claude.query(this.#prompt())) {
        logger.debug("Received Claude Code message: {message}", { message });

        this.#processMessage(message);
      }
    } finally {
      this.#closeClaudeCode(claude);
    }

    if (!this.#resultMessage)
      return {
        status: "failure",
        details: "No result received from Claude Code",
      };

    const verdict = ScenarioVerdict.read(this.#resultMessage);
    const { details } = verdict;

    if (verdict.status === "failure") return { status: "failure", details };

    // NOTE: Checked after the verdict, since the session is only needed to save
    // the recording, and a failed run is never saved.
    if (!this.#sessionId)
      return {
        status: "failure",
        details: "No Claude Code SDK session ID received from Claude Code",
      };

    const session = this.#sessionStore.snapshot(this.#sessionId);

    // NOTE: Kept on the scenario, so that a playback can close with the same
    // account of the run the recording closed with - it has no agent to write a
    // fresh one.
    this.#scenario.verdict = { status: "success", details };

    return {
      status: "success",
      details,
      session,
    };
  }

  /**
   * What the agent is asked to do, as the prompt the recording opens with.
   *
   * NOTE: A recovery's own instructions go here, in the prompt, rather than into
   * the system prompt where they used to be. They are about this run of this
   * scenario, not about how the agent works, and a system prompt is the wrong
   * place to argue with what the rest of the context says.
   *
   * @returns The prompt.
   */
  #prompt(): string {
    const recovery = this.#recovery;

    const prompt = `
You are a test agent that runs a test scenario with Alumnium.

You will run the scenario step by step, using do, check, get, and other MCP tools to perform the scenario.
You will report any errors that occur during the scenario.

After reading the scenario, create an internal todo list to track execution and ensure you're on track. Complete each step before moving on to the next.

The last task in the todo list is to report the scenario result.
You MUST report that result by calling the StructuredOutput tool, and not as prose:
- result "success" when every step was performed and every check and assertion in the scenario held.
- result "failure" when a step could not be performed, a check returned a consistent failure, or the scenario could not be completed for any other reason.
- details always, either way: what the scenario did and verified when it passed, what failed and how when it did not. This is what the person running the test reads at the end, so write it for them rather than restating the scenario.

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

    // NOTE: Concatenated rather than run through `txts`, which rewraps: it joins
    // the consecutive lines of a paragraph into one, which would run the
    // numbered lists above - and the scenario's own markdown - together.
    if (!recovery) return prompt;

    return `${prompt}\n${ScenarioRecovery.prompt(recovery)}\n`;
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
          ScenarioReporter.thinking(block.thinking);
          return this.#recordNarration("thinking", block.thinking);

        case "text":
          // NOTE: Under `outputFormat` the agent's final message is the verdict
          // itself, which the runner reports on its own - printing the raw JSON
          // on top of the `● failed` line is noise.
          if (ScenarioVerdict.Text.safeParse(block.text).success) {
            logger.debug(`Not reporting the verdict message: {text}`, {
              text: block.text,
            });
            return;
          }

          ScenarioReporter.assistant(block.text);
          return this.#recordNarration("assistant", block.text);

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

  /**
   * NOTE: Kept rather than resolved here, so that the verdict is read once the
   * query is over. A later result message wins, which is what a recording that
   * takes more than one turn would need.
   */
  #processResultMessage(message: SDKResultMessage) {
    this.#sessionId = message.session_id;
    this.#resultMessage = message;
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
          "Bash",
          "mcp__alumnium__*",
          ...ScenarioExternalMcp.allowedTools(),
        ],
        thinking: { type: "adaptive", display: "summarized" },
        // NOTE: What makes the pass/fail verdict a contract of the run rather
        // than something to be read out of the agent's prose: the SDK holds the
        // agent to this schema, and reports the answer on the result message.
        outputFormat: {
          type: "json_schema",
          schema: ScenarioVerdict.jsonSchema(),
        },
        settingSources: [],
        sessionStore: this.#sessionStore,
        sessionStoreFlush: "eager",
        systemPrompt: {
          type: "preset",
          preset: "claude_code",
          excludeDynamicSections: true,
          append: txts(
            // NOTE: Advisory, and it cannot be enforced from here: `stop` runs
            // while the turn is still going, and tears the driver down with it,
            // so by the time the verdict exists there is nothing left to gate.
            // Gating it for real means staging the cache write and committing it
            // once the verdict is in - see `stopMcpTool`.
            `
              Call the \`mcp__alumnium__stop\` tool only once you know the
              scenario result. If the test is successful, make sure to pass
              \`"save_cache": true\` to it to save the cache for future test
              runs. If the test failed, pass \`"save_cache": false\`, so that a
              failed run does not persist its decisions for later runs.
            `,
          ),
        },
        // NOTE: Never resumed, not even by a recovery. The session a recovery
        // would resume is the recording it is replacing, which ends on a
        // successful run of this very scenario - an agent that is handed it reads
        // the work as already done and re-executes nothing. See
        // `ScenarioRecovery`.
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

  //#region Narration

  /**
   * Records what the agent said, so that a playback of this recording reads the
   * way the recording did. Nothing is executed from it.
   *
   * NOTE: Pushed as the message arrives, while a tool call is pushed once its
   * result does. Narration therefore lands ahead of the call it introduced,
   * which is the order it was printed in.
   *
   * @param narration - Which kind of prose this is.
   * @param text - Prose as the agent wrote it.
   */
  #recordNarration(
    narration: Scenario.ClaudeCodeNarrationStep["narration"],
    text: string,
  ) {
    // NOTE: Empty prose is dropped rather than stored, matching the reporter,
    // which prints nothing for it either.
    if (!text.trim()) return;

    this.#scenario.steps.push({ kind: "narration", narration, text });
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
