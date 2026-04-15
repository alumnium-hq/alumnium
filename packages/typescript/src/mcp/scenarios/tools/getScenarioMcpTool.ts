import { McpTool } from "../../tools/McpTool.ts";
import { scenariosMcpToolsShape } from "./scenariosMcpToolsShape.ts";

/**
 * Gets recorded scenario details.
 */
export const getScenarioMcpTool = McpTool.define({
  ...scenariosMcpToolsShape.get,

  async execute(input, { scenarios, logger }) {
    const { scenarioId } = input;
    return scenarios.logWrapMethodResult(
      logger,
      `Getting scenario details (ID: ${scenarioId})`,
      () => scenarios.getScenario(scenarioId),
    );
  },
});
