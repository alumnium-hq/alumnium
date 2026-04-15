import { McpTool } from "../../tools/McpTool.ts";
import { scenariosMcpToolsShape } from "./scenariosMcpToolsShape.ts";

/**
 * Diverges the running scenario run.
 */
export const divergeScenarioMcpTool = McpTool.define({
  ...scenariosMcpToolsShape.diverge,

  async execute(input, { scenarios, logger }) {
    const { scenarioId } = input;
    return scenarios.logWrapMethodResult(
      logger,
      `Diverging scenario recording (ID: ${scenarioId})`,
      () => scenarios.divergeScenario(scenarioId),
    );
  },
});
