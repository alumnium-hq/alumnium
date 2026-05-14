import { always } from "alwaysly";
import { canonize } from "smolcanon";
import { Telemetry } from "../telemetry/Telemetry.ts";
import { Scenario } from "./Scenario.ts";
import { ScenarioAlumniumMcp } from "./ScenarioAlumniumMcp.ts";
import { ScenarioMasker } from "./ScenarioMasker.ts";

const { logger } = Telemetry.get(import.meta.url);

export namespace ScenarioPlayer {
  export interface Props {
    scenario: Scenario.Type;
  }

  export type PlayFn = (step: Scenario.ClaudeCodeStep) => Promise<void>;

  export interface ResultSuccess {
    status: "success";
  }

  export interface ResultFailure {
    status: "failure";
    error: string;
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

    try {
      for (const stepIdxStr in this.#scenario.steps) {
        const step = this.#scenario.steps[stepIdxStr];
        always(step);

        const stepCounterStr = `${Number(stepIdxStr) + 1}/${stepsCount}`;
        logger.info(`Playing step ${stepCounterStr}`);

        const { use, result } = step;
        const mcpName = mcp.convertNameFromToolUse(use.name);

        const unmaskedInput = this.#masker.unmaskInput(use.input);
        const mcpOutput = await mcp.call(mcpName, unmaskedInput);

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

              return {
                status: "failure",
                error: message,
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

  //#region Matching

  #matchOutput(
    toolResultContent: Scenario.ClaudeCodeStepToolResultContent,
    mcpOutputContent: ScenarioAlumniumMcp.OutputContent,
  ): boolean {
    return canonize(toolResultContent) === canonize(mcpOutputContent);
  }

  //#endregion
}
