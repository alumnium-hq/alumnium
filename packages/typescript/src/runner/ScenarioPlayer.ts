import { canonize } from "smolcanon";
import { Env } from "../Env.ts";
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

  /**
   * What re-asking a disagreed `check` amounted to: the recording and the
   * application disagree however many times the question is put (`confirmed`), or
   * the verdict simply isn't reproducible (`unstable`).
   *
   * NOTE: A type of its own rather than a fourth `CheckComparison`. A comparison
   * is how two verdicts relate, and `compareCheckOutput` is total over it; this
   * is a verdict on a series of those comparisons, which no comparison of two
   * outputs could ever produce. Only `disagreed` leads here.
   */
  export type CheckConfirmation = "confirmed" | "unstable";

  /** A `check` that disagreed with its recording and then agreed on a re-ask. */
  export interface UnstableCheck {
    /** The statement as the console prints it. */
    statement: string;
    /** Re-asks it took to agree. */
    attempts: number;
  }

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
  #unstableChecks: ScenarioPlayer.UnstableCheck[] = [];

  constructor(scenario: Scenario.Type) {
    this.#scenario = scenario;
  }

  /**
   * Cache lookups made by all the steps played so far.
   */
  get lookups(): CacheLookups {
    return { ...this.#lookups };
  }

  /**
   * Checks that only agreed with the recording once they were re-asked.
   *
   * NOTE: A property of the run rather than part of `Result`, the way `lookups`
   * is. A playback can carry an unstable check and then fail on a later step for
   * an unrelated reason, and hanging this off `ResultSuccess` would lose it
   * exactly then - while putting it on both members of the union duplicates the
   * field.
   */
  get unstableChecks(): ScenarioPlayer.UnstableCheck[] {
    return [...this.#unstableChecks];
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

            // NOTE: Not taken at face value. A verdict is one LLM call, and a
            // playback that fails on it re-records the whole scenario - far too
            // much to spend on a coin flip. So the question is put again, with
            // the cache bypassed so that each re-ask actually reaches the model.
            const confirmations = Env.ALUMNIUM_CHECK_CONFIRMATIONS;
            if (confirmations > 0) {
              ScenarioReporter.stepCheckReasking(confirmations);
            }

            const comparisons = await this.#reaskCheck(
              mcp,
              input,
              useContent,
              confirmations,
            );
            const confirmation =
              ScenarioPlayer.confirmCheckDisagreement(comparisons);

            if (confirmation === "unstable") {
              const statement = ScenarioReporter.summarizeMcpInput(input);
              this.#unstableChecks.push({
                statement,
                attempts: comparisons.length,
              });
              logger.warn(
                `Step ${stepCounterStr} MCP tool '${use.name}' disagreed with the recording and then agreed on re-ask ${comparisons.length}/${confirmations}, continuing`,
              );
              ScenarioReporter.stepCheckUnstable(
                comparisons.length,
                confirmations,
              );
              break;
            }

            // NOTE: The re-asks go into the message, because this is what the
            // recovery agent is told about the failure (see `ScenarioRecovery`).
            // Being told the verdict was re-tested is the difference between "the
            // recording and the application disagree" and "an LLM said so once".
            const message = comparisons.length
              ? `MCP tool '${use.name}' output does not match expected result, confirmed over ${1 + comparisons.length} attempts with the response cache bypassed!`
              : `MCP tool '${use.name}' output does not match expected result!`;
            logger.error(
              `Step ${stepCounterStr} ${message}\nExpected: {useContent}\nActual: {mcpContent}`,
              { useContent, mcpContent },
            );
            log.error = message;

            if (comparisons.length) {
              ScenarioReporter.stepCheckConfirmed(comparisons.length);
            }

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
   * NOTE: So is a call the recording has failing, see below.
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

    // NOTE: A call the recording has failing is not executed again. It produced
    // no values to substitute - `ScenarioRecorder` registers none for it - and
    // the calls that follow it are there *because* it failed, an agent retrying
    // it being the usual case. Running it again therefore repeats whatever its
    // failure did to the system under test while the retry runs too: a call that
    // creates a resource and then errors can claim the very thing its retry asks
    // for, so the retry fails instead - and the values the later inputs are
    // masked against never get produced.
    //
    // The call index is still spent, so that a mask naming one of the calls
    // after it keeps resolving.
    if (Scenario.isFailedToolResult(step.result)) {
      const reason = "the recording has this call failing";
      logger.info(
        `External tool '${use.name}' failed when it was recorded, skipping`,
      );
      ScenarioReporter.externalStepSkipped(use.name, reason);

      return null;
    }

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

  /**
   * Re-asks a `check` whose verdict disagrees with its recording, with the
   * response cache bypassed so that each re-ask actually reaches the model, and
   * stops at the first one that agrees.
   *
   * NOTE: No delay between re-asks, and none before the first. A confirmation is
   * meant to put the same question to the same page; waiting would let an
   * application that was merely slow finish rendering, which quietly turns a
   * check that needs a `wait` in front of it into a check that passes.
   *
   * NOTE: The cache lookups these calls report are dropped rather than added to
   * `lookups`. That counter answers how much of the recording replayed for free,
   * and a call whose whole purpose is to bypass the cache is not a cache failure
   * - counting it would let one flaky check drag down the rate and make it
   * incomparable between runs. The outcome lines say re-asks happened instead.
   *
   * @param mcp - Client to re-issue the call through.
   * @param input - The `check` input, unmasked, as the step was played with.
   * @param recordedContent - Recorded output to compare each re-ask against.
   * @param confirmations - How many re-asks to make at most.
   * @returns How each re-ask compared with the recording, in the order they ran.
   */
  async #reaskCheck(
    mcp: ScenarioAlumniumMcp,
    input: ScenarioAlumniumMcp.Input,
    recordedContent: Scenario.ClaudeCodeStepToolResultContent,
    confirmations: number,
  ): Promise<ScenarioPlayer.CheckComparison[]> {
    const comparisons: ScenarioPlayer.CheckComparison[] = [];

    for (let attempt = 1; attempt <= confirmations; attempt++) {
      const mcpOutput = await mcp.call("check", input, { noCache: true });

      logger.debug(
        `Re-asked check ${attempt}/${confirmations}, got: {mcpOutput}`,
        { mcpOutput },
      );

      const comparison = ScenarioPlayer.compareCheckOutput(
        recordedContent,
        mcpOutput.content,
      );
      comparisons.push(comparison);

      if (comparison !== "disagreed") break;
    }

    return comparisons;
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

  /**
   * Judges a `check` that disagreed with its recording by what re-asking it
   * produced.
   *
   * NOTE: Takes the comparisons rather than the outputs, so that the policy is a
   * pure function of them and the reading of a verdict stays in one place -
   * `compareCheckOutput`. Anything but `disagreed` counts as agreement, which in
   * practice means `agreed`: a re-ask can only reach `improved` if the recording
   * has the check failing, and a recorded failure never gets here.
   *
   * @param comparisons - How each re-ask compared with the recording, in order.
   * @returns `unstable` when a re-ask agreed, `confirmed` when none did -
   *   including when there were none to make, which is how playback behaved
   *   before re-asking existed.
   */
  static confirmCheckDisagreement(
    comparisons: ScenarioPlayer.CheckComparison[],
  ): ScenarioPlayer.CheckConfirmation {
    return comparisons.some((comparison) => comparison !== "disagreed")
      ? "unstable"
      : "confirmed";
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
