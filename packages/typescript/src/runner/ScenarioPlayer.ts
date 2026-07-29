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

    const stepsCount = this.#scenario.steps.length;
    const logs: ScenarioPlayer.Log[] = [];

    try {
      for (const stepIdxStr in this.#scenario.steps) {
        const step = this.#scenario.steps[stepIdxStr];
        always(step);

        const stepCounterStr = `${Number(stepIdxStr) + 1}/${stepsCount}`;
        logger.info(`Playing step ${stepCounterStr}`);

        if (step.kind === "external-tool-use") {
          const externalError = await this.#playExternalStep(
            stepCounterStr,
            step,
          );
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
        ScenarioReporter.step(stepCounterStr, mcpName, input);

        const unresolvedMasks =
          ScenarioMasker.findUnresolvedExternalMasks(input);
        if (unresolvedMasks.length) {
          const message = `Step ${stepCounterStr} MCP tool '${use.name}' input has unresolved external values: ${unresolvedMasks.join(", ")}. The external tool did not produce them again - its output may no longer be JSON, or may be missing those keys.`;
          logger.error(message);
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

        ScenarioReporter.toolResult(mcpOutput.content);

        switch (mcpName) {
          case "start":
            this.#masker.processMcpStartOutputContent(mcpOutput.content);
            break;

          case "get":
          case "check":
            const useContent = result.content;
            const mcpContent = mcpOutput.content;

            logger.debug(
              "Comparing MCP output with expected result: {useContent}",
              { useContent },
            );

            const outputMatches = ScenarioPlayer.matchOutput(
              mcpName,
              useContent,
              mcpContent,
            );

            if (outputMatches) {
              logger.info(
                `Step ${stepCounterStr} MCP tool '${use.name}' output matches expected result`,
              );
              ScenarioReporter.stepMatched(mcpName);
            } else {
              const message = `Step ${stepCounterStr} MCP tool '${use.name}' output does not match expected result!`;
              logger.error(
                `${message}\nExpected: {useContent}\nActual: {mcpContent}`,
                { useContent, mcpContent },
              );
              log.error = message;
              ScenarioReporter.stepMismatched(mcpName, useContent, mcpContent);

              return {
                status: "failure",
                error: message,
                logs,
              };
            }
            break;
        }
      }

      logger.info(`Scenario played all ${stepsCount} steps successfully`);

      return { status: "success" };
    } finally {
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
   * @param stepCounter - Human-readable step position, e.g. `2/7`.
   * @param step - External tool call step to replay.
   * @returns Error message when the call failed, `null` otherwise.
   */
  async #playExternalStep(
    stepCounter: string,
    step: Scenario.ClaudeCodeExternalStep,
  ): Promise<string | null> {
    const { use } = step;
    const callIndex = this.#externalCallsCount++;

    ScenarioReporter.externalStep(stepCounter, use.name, use.input);

    const input = ScenarioAlumniumMcp.parseInput(use.input);
    const result = await ScenarioExternalTool.execute(use.name, input);

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

  #matchOutput(
    toolResultContent: Scenario.ClaudeCodeStepToolResultContent,
    mcpOutputContent: ScenarioAlumniumMcp.OutputContent,
  ): boolean {
    return canonize(toolResultContent) === canonize(mcpOutputContent);
  }

  //#endregion
}
