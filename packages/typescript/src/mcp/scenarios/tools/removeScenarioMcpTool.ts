import { McpTool } from "../../tools/McpTool.ts";
import { scenariosMcpToolsShape } from "./scenariosMcpToolsShape.ts";

/**
 * Removes a recorded scenario.
 */
export const removeScenarioMcpTool = McpTool.define({
  ...scenariosMcpToolsShape.remove,

  async execute(input, { scenarios, logger }) {
    const { scenarioId } = input;
    return scenarios.logWrapMethodResult(
      logger,
      `Deleting scenario recording (ID: ${scenarioId})`,
      () => scenarios.removeScenario(scenarioId),
    );
  },
});
