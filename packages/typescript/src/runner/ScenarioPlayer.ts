import { canonize } from "smolcanon";
import { type CacheLookups, createCacheLookups } from "../llm/llmSchema.ts";
import {
  MCP_CACHE_LOOKUPS_META_KEY,
  parseMcpCacheLookups,
} from "../mcp/mcpCacheLookups.ts";
import { Telemetry } from "../telemetry/Telemetry.ts";
import { Scenario } from "./Scenario.ts";
import { ScenarioAlumniumMcp } from "./ScenarioAlumniumMcp.ts";
import { ScenarioExternalMcp } from "./ScenarioExternalMcp.ts";
import { ScenarioExternalTool } from "./ScenarioExternalTool.ts";
import { ScenarioMasker } from "./ScenarioMasker.ts";
import { ScenarioReporter } from "./ScenarioReporter.ts";

const { logger } = Telemetry.get(import.meta.url);

const ALUMNIUM_OPTIONS_KEY = "alumnium:options";

// NOTE: How a failed tool call reads when the flag isn't there to tell it by.
// See `ScenarioPlayer.readOutputError`.
const ERROR_TEXT_PREFIX = "Error:";

// NOTE: The two verdicts `checkMcpTool` emits. Matched by value rather than
// assumed to be the only two, since the output schema types `result` as a plain
// string - so a verdict neither of these covers stays a disagreement.
const SUCCESS_VERDICT = "success";
const FAILURE_VERDICT = "failure";

export namespace ScenarioPlayer {
  export interface Props {
    scenario: Scenario.Type;
  }

  export type PlayFn = (step: Scenario.ClaudeCodeStep) => Promise<void>;

  /**
   * What one played step did, kept so that a recovery can be told how far the
   * playback got and where it stopped. See `ScenarioRecovery`.
   *
   * NOTE: Only an Alumnium MCP step is logged. An external call is replayed for
   * the values it produces rather than compared, and narration is printed
   * without being played at all.
   */
  export interface Log {
    step: Scenario.ClaudeCodeMcpStep;
    mcpOutput: ScenarioAlumniumMcp.Output;
    error?: string;
  }

  /**
   * How a played `check` verdict compares with the one recorded for that step.
   *
   * NOTE: Only `disagreed` fails a playback. `improved` - the recording has the
   * check failing and it passes now - does not: a recording legitimately holds a
   * check that failed, either a false start the agent went on to correct or an
   * application that has since been fixed, and neither is a reason to throw the
   * recording away and re-record. So the playback continues past it.
   */
  export type CheckComparison = "agreed" | "improved" | "disagreed";

  export interface ResultSuccess {
    status: "success";
  }

  export interface ResultFailure {
    status: "failure";
    error: string;
    logs: Log[];
  }

  export type Result = ResultSuccess | ResultFailure;
}

export class ScenarioPlayer {
  #scenario: Scenario.Type;
  #masker = new ScenarioMasker();
  #externalCallsCount = 0;
  #lookups = createCacheLookups();

  constructor(scenario: Scenario.Type) {
    this.#scenario = scenario;
  }

  /**
   * Cache lookups made by all the steps played so far.
   */
  get lookups(): CacheLookups {
    return { ...this.#lookups };
  }

  //#region Playback

  async play(): Promise<ScenarioPlayer.Result> {
    const mcp = new ScenarioAlumniumMcp();
    await mcp.connect();

    // NOTE: External servers are connected lazily, on the first call to one of
    // their tools, so a scenario that uses none never spawns them.
    const externalMcp = new ScenarioExternalMcp();

    const stepsCount = Scenario.executableStepsCount(this.#scenario);
    const logs: ScenarioPlayer.Log[] = [];
    let stepNumber = 0;

    try {
      for (const step of this.#scenario.steps) {
        // NOTE: Printed rather than played, and left out of the step counting -
        // it is what the agent said while recording, not something to redo.
        if (step.kind === "narration") {
          this.#reportNarration(step);
          continue;
        }

        const stepCounterStr = `${++stepNumber}/${stepsCount}`;
        logger.info(`Playing step ${stepCounterStr}`);

        if (step.kind === "external-tool-use") {
          const externalError = await this.#playExternalStep(step, externalMcp);
          if (!externalError) continue;

          return { status: "failure", error: externalError, logs };
        }

        const { use, result } = step;
        const mcpName = ScenarioAlumniumMcp.convertNameFromToolUse(use.name);

        const unmaskedInput = this.#masker.unmaskInput(use.input);
        const input =
          mcpName === "start"
            ? this.#disableChangeAnalysis(unmaskedInput)
            : unmaskedInput;
        ScenarioReporter.step(mcpName, input);

        const unresolvedMasks =
          ScenarioMasker.findUnresolvedExternalMasks(input);
        if (unresolvedMasks.length) {
          const message = `MCP tool '${use.name}' input has unresolved external values: ${unresolvedMasks.join(", ")}. The external tool did not produce them again - its output may no longer be JSON, or may be missing those keys.`;
          // NOTE: The step position goes to the log only. The console doesn't
          // number the steps, since it doesn't print all of them.
          logger.error(`Step ${stepCounterStr} ${message}`);
          ScenarioReporter.failed(message);

          return { status: "failure", error: message, logs };
        }

        const mcpOutput = await mcp.call(mcpName, input);

        const log: ScenarioPlayer.Log = {
          step,
          mcpOutput,
        };
        logs.push(log);

        const lookups = parseMcpCacheLookups(
          mcpOutput._meta?.[MCP_CACHE_LOOKUPS_META_KEY],
        );
        if (lookups) {
          this.#lookups.hits += lookups.hits;
          this.#lookups.misses += lookups.misses;
          ScenarioReporter.stepCache(lookups);
        }

        ScenarioReporter.toolResult(mcpName, mcpOutput.content);

        // NOTE: Compared, and not just detected, the way a `check` verdict is
        // below. A recording can legitimately hold a call that failed - the agent
        // tried something, it errored, it went on - and replaying that call is
        // expected to fail again. What fails a playback is a call that errors now
        // and did not when it was recorded.
        const recordedError = ScenarioPlayer.readOutputError(
          result.content,
          result.is_error,
        );
        const playedError = ScenarioPlayer.readOutputError(
          mcpOutput.content,
          Boolean(mcpOutput.isError),
        );

        if (playedError && !recordedError) {
          const message = `MCP tool '${use.name}' failed: ${playedError}`;
          logger.error(`Step ${stepCounterStr} ${message}`);
          log.error = message;

          return { status: "failure", error: message, logs };
        }

        switch (mcpName) {
          case "start":
            this.#masker.processMcpStartOutputContent(mcpOutput.content);
            break;

          case "check": {
            const useContent = result.content;
            const mcpContent = mcpOutput.content;

            logger.debug(
              "Comparing MCP output with expected result: {useContent}",
              { useContent },
            );

            const comparison = ScenarioPlayer.compareCheckOutput(
              useContent,
              mcpContent,
            );

            if (comparison === "agreed") {
              logger.info(
                `Step ${stepCounterStr} MCP tool '${use.name}' output matches expected result`,
              );
              break;
            }

            // NOTE: Not a failure, and not something to recover from. See
            // `ScenarioPlayer.CheckComparison`.
            if (comparison === "improved") {
              logger.info(
                `Step ${stepCounterStr} MCP tool '${use.name}' passed where the recording has it failing, continuing`,
              );
              ScenarioReporter.stepCheckImproved();
              break;
            }

            const message = `MCP tool '${use.name}' output does not match expected result!`;
            logger.error(
              `Step ${stepCounterStr} ${message}\nExpected: {useContent}\nActual: {mcpContent}`,
              { useContent, mcpContent },
            );
            log.error = message;

            return {
              status: "failure",
              error: message,
              logs,
            };
          }
        }
      }

      logger.info(`Scenario played all ${stepsCount} steps successfully`);

      return { status: "success" };
    } catch (error) {
      // NOTE: A throw here - a dead MCP transport, a recorded input that no
      // longer parses - still means this recording can no longer be replayed, so
      // it is a playback failure like any other and goes to recovery, which
      // spawns its own MCP child process anyway.
      const message = `Scenario playback failed: ${error}`;
      logger.error(`${message}: {error}`, { error });
      ScenarioReporter.failed(message);

      return { status: "failure", error: message, logs };
    } finally {
      await externalMcp.close();
      await mcp.close();
    }
  }

  /**
   * Prints a recorded piece of the agent's prose the way the recording printed
   * it.
   *
   * @param step - Narration step to report.
   */
  #reportNarration(step: Scenario.ClaudeCodeNarrationStep) {
    if (step.narration === "thinking")
      return ScenarioReporter.thinking(step.text);

    return ScenarioReporter.assistant(step.text);
  }

  /**
   * Re-executes an external tool call and registers the values it produced, so
   * that the MCP tool inputs that follow get the fresh ones instead of the
   * recorded ones.
   *
   * NOTE: Tools that only exist inside the agent (e.g. `ToolSearch`) cannot be
   * executed here. They are skipped, and only fail the playback if a later MCP
   * tool input actually depends on their output, which surfaces as an
   * unresolved mask.
   *
   * @param step - External tool call step to replay.
   * @param mcp - Client to reach external MCP servers through.
   * @returns Error message when the call failed, `null` otherwise.
   */
  async #playExternalStep(
    step: Scenario.ClaudeCodeExternalStep,
    mcp: ScenarioExternalMcp,
  ): Promise<string | null> {
    const { use } = step;
    const callIndex = this.#externalCallsCount++;

    // NOTE: The same gate the recorder masks behind, so that a prose-only tool
    // input is left exactly as recorded in both phases.
    const input = ScenarioMasker.masksToolInput(use.name)
      ? this.#masker.unmaskExternalToolInput(use.input)
      : ScenarioAlumniumMcp.parseInput(use.input);

    // NOTE: Reported unmasked, like the MCP steps above, so that the console
    // shows the call that actually runs.
    ScenarioReporter.externalStep(use.name, input);

    const result = await ScenarioExternalTool.execute(use.name, input, mcp);

    if (result.status === "failure") {
      ScenarioReporter.failed(result.error);
      return result.error;
    }

    if (result.status === "unsupported") {
      logger.info(
        `External tool '${use.name}' cannot be executed during playback (${result.reason}), skipping`,
      );
      ScenarioReporter.externalStepSkipped(use.name, result.reason);
      return null;
    }

    logger.debug(`External tool '${use.name}' output: ${result.output}`);
    ScenarioReporter.toolResult(use.name, result.output);
    this.#masker.registerExternalOutput(callIndex, result.output);

    return null;
  }

  //#endregion

  //#region Capabilities

  /**
   * Disables the UI changes analysis agent in the recorded `start` tool input.
   * The analysis costs an extra LLM call per `do` step and playback never
   * compares `do` output, so it's pure overhead during playback.
   *
   * @param input - Unmasked `start` tool input.
   * @returns Tool input with change analysis disabled.
   */
  #disableChangeAnalysis(
    input: ScenarioAlumniumMcp.Input,
  ): ScenarioAlumniumMcp.Input {
    const { capabilities } = input;

    // NOTE: Capabilities can also be a path to a JSON file, which we don't
    // rewrite. See `startMcpTool`.
    if (typeof capabilities !== "string") return input;

    let parsedCapabilities: unknown;
    try {
      parsedCapabilities = JSON.parse(capabilities);
    } catch {
      logger.warn(
        "Capabilities are not an inline JSON string, cannot disable change analysis",
      );
      return input;
    }

    if (typeof parsedCapabilities !== "object" || parsedCapabilities === null) {
      logger.warn(
        "Capabilities are not a JSON object, cannot disable change analysis",
      );
      return input;
    }

    const capabilitiesRecord = parsedCapabilities as Record<string, unknown>;
    const alumniumOptions = capabilitiesRecord[ALUMNIUM_OPTIONS_KEY];

    capabilitiesRecord[ALUMNIUM_OPTIONS_KEY] = Object.assign(
      typeof alumniumOptions === "object" && alumniumOptions !== null
        ? alumniumOptions
        : {},
      { changeAnalysis: false },
    );

    logger.debug("Disabled change analysis for playback: {capabilities}", {
      capabilities: capabilitiesRecord,
    });

    return Object.assign(input, {
      capabilities: JSON.stringify(capabilitiesRecord),
    });
  }

  //#endregion

  //#region Matching

  /**
   * Reads the error out of an Alumnium MCP tool output, whichever way the tool
   * reported it.
   *
   * NOTE: The text is read as well as the flag. The MCP server only started
   * flagging a failed call (see `McpServer`), so in a recording made before that
   * an `Error: ...` text block is all there is to tell one by - and both sides of
   * a comparison have to be read the same way for a recording to keep replaying.
   *
   * @param content - Tool output content.
   * @param isError - Whether the call was flagged as failed, under whichever name
   *   the side being read spells it (`isError` on an MCP result, `is_error` on a
   *   recorded tool result).
   * @returns What the tool reported, `null` when it did not fail.
   */
  static readOutputError(
    content: unknown,
    isError?: boolean | undefined,
  ): string | null {
    const texts = ScenarioAlumniumMcp.outputTexts(content).map((text) =>
      text.trim(),
    );

    if (isError) return texts.join(" ").trim() || "the tool call failed";

    return texts.find((text) => text.startsWith(ERROR_TEXT_PREFIX)) ?? null;
  }

  /**
   * Compares a `check` output against the one recorded for the same step.
   *
   * Only one direction of disagreement is tolerated, and only between the two
   * verdicts `check` emits: a check the recording has failing that passes now.
   * The reverse - passing when recorded, failing now - is exactly what a
   * playback exists to catch. See `ScenarioPlayer.CheckComparison`.
   *
   * @param toolResultContent - Recorded tool result content.
   * @param mcpOutputContent - Content the tool produced during playback.
   * @returns How the two verdicts compare.
   */
  static compareCheckOutput(
    toolResultContent: Scenario.ClaudeCodeStepToolResultContent,
    mcpOutputContent: ScenarioAlumniumMcp.OutputContent,
  ): ScenarioPlayer.CheckComparison {
    const expectedVerdict = checkVerdict(toolResultContent);
    const actualVerdict = checkVerdict(mcpOutputContent);

    if (expectedVerdict && actualVerdict) {
      if (expectedVerdict === actualVerdict) return "agreed";

      if (
        expectedVerdict === FAILURE_VERDICT &&
        actualVerdict === SUCCESS_VERDICT
      )
        return "improved";

      return "disagreed";
    }

    logger.warn(
      "Cannot read the 'check' verdict out of the output, comparing it in full",
    );

    return canonize(toolResultContent) === canonize(mcpOutputContent)
      ? "agreed"
      : "disagreed";
  }

  //#endregion
}

/**
 * Reads the verdict out of a `check` tool output.
 *
 * NOTE: Only the verdict is compared. The explanation next to it is prose the
 * LLM writes anew every time, so it differs between two runs that reached the
 * same verdict ("the accessibility tree includes a heading saying ..." vs "the
 * accessibility tree contains a heading: ...").
 *
 * @param content - Tool output content.
 * @returns Verdict, `null` when the content does not carry one.
 */
function checkVerdict(content: unknown): string | null {
  for (const text of ScenarioAlumniumMcp.outputTexts(content)) {
    const parseResult = ScenarioAlumniumMcp.CheckOutput.safeParse(text);
    if (parseResult.success) return parseResult.data.result;
  }

  return null;
}
