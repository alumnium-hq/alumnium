import { McpTool } from "../../tools/McpTool.ts";
import { scenariosMcpToolsShape } from "./scenariosMcpToolsShape.ts";

/**
 * Plays a running scenario step.
 */
export const stepScenarioMcpTool = McpTool.define({
  ...scenariosMcpToolsShape.step,

  async execute(input, { scenarios, logger }) {
    const { scenarioId } = input;
    return scenarios.logWrapMethodResult(
      logger,
      `Stepping running scenario (ID: ${scenarioId})`,
      () => scenarios.stepScenario(scenarioId),
    );
  },
});
