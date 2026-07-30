import { always } from "alwaysly";
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

export namespace ScenarioPlayer {
  export interface Props {
    scenario: Scenario.Type;
  }

  export type PlayFn = (step: Scenario.ClaudeCodeStep) => Promise<void>;

  export interface Log {
    step: Scenario.ClaudeCodeStep;
    mcpOutput: ScenarioAlumniumMcp.Output;
    error?: string;
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

    const stepsCount = this.#scenario.steps.length;
    const logs: ScenarioPlayer.Log[] = [];

    try {
      for (const stepIdxStr in this.#scenario.steps) {
        const step = this.#scenario.steps[stepIdxStr];
        always(step);

        const stepCounterStr = `${Number(stepIdxStr) + 1}/${stepsCount}`;
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

            if (ScenarioPlayer.matchCheckOutput(useContent, mcpContent)) {
              logger.info(
                `Step ${stepCounterStr} MCP tool '${use.name}' output matches expected result`,
              );
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
    } finally {
      await externalMcp.close();
      await mcp.close();
    }
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

    ScenarioReporter.externalStep(use.name, use.input);

    const input = ScenarioAlumniumMcp.parseInput(use.input);
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
   * Compares a `check` output against the one recorded for the same step.
   *
   * @param toolResultContent - Recorded tool result content.
   * @param mcpOutputContent - Content the tool produced during playback.
   * @returns `true` when both reached the same verdict.
   */
  static matchCheckOutput(
    toolResultContent: Scenario.ClaudeCodeStepToolResultContent,
    mcpOutputContent: ScenarioAlumniumMcp.OutputContent,
  ): boolean {
    const expectedVerdict = checkVerdict(toolResultContent);
    const actualVerdict = checkVerdict(mcpOutputContent);

    if (expectedVerdict && actualVerdict)
      return expectedVerdict === actualVerdict;

    logger.warn(
      "Cannot read the 'check' verdict out of the output, comparing it in full",
    );

    return canonize(toolResultContent) === canonize(mcpOutputContent);
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
