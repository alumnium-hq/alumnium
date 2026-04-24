import { McpTool } from "../../tools/McpTool.ts";
import { scenariosMcpToolsShape } from "./scenariosMcpToolsShape.ts";

/**
 * Plays recorded scenario steps.
 */
export const playScenarioMcpTool = McpTool.define({
  ...scenariosMcpToolsShape.play,

  async execute(input, { scenarios, logger }) {
    const { scenarioId, stepByStep } = input;
    return scenarios.logWrapMethodResult(
      logger,
      `Playing scenario recording (ID: ${scenarioId}, stepByStep: ${stepByStep})`,
      () => scenarios.playScenario(scenarioId, stepByStep),
    );
  },
});
