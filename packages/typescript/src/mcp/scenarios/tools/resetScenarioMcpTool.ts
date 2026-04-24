import { McpTool } from "../../tools/McpTool.ts";
import { scenariosMcpToolsShape } from "./scenariosMcpToolsShape.ts";

/**
 * Resets the running scenario.
 */
export const resetScenarioMcpTool = McpTool.define({
  ...scenariosMcpToolsShape.reset,

  async execute(input, { scenarios, logger }) {
    const { scenarioId } = input;
    return scenarios.logWrapMethodResult(
      logger,
      `Resets the running scenario (ID: ${scenarioId})`,
      () => scenarios.resetScenario(scenarioId),
    );
  },
});
