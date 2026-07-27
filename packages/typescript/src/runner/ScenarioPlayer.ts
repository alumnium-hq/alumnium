import { always } from "alwaysly";
import { canonize } from "smolcanon";
import { Telemetry } from "../telemetry/Telemetry.ts";
import { Scenario } from "./Scenario.ts";
import { ScenarioAlumniumMcp } from "./ScenarioAlumniumMcp.ts";
import { ScenarioMasker } from "./ScenarioMasker.ts";

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

  constructor(scenario: Scenario.Type) {
    this.#scenario = scenario;
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

        const { use, result } = step;
        const mcpName = mcp.convertNameFromToolUse(use.name);

        const unmaskedInput = this.#masker.unmaskInput(use.input);
        const input =
          mcpName === "start"
            ? this.#disableChangeAnalysis(unmaskedInput)
            : unmaskedInput;
        const mcpOutput = await mcp.call(mcpName, input);

        const log: ScenarioPlayer.Log = {
          step,
          mcpOutput,
        };
        logs.push(log);

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

            const outputMatches = this.#matchOutput(useContent, mcpContent);

            if (outputMatches) {
              logger.info(
                `Step ${stepCounterStr} MCP tool '${use.name}' output matches expected result`,
              );
            } else {
              const message = `Step ${stepCounterStr} MCP tool '${use.name}' output does not match expected result!`;
              logger.error(
                `${message}\nExpected: {useContent}\nActual: {mcpContent}`,
                { useContent, mcpContent },
              );
              log.error = message;

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
