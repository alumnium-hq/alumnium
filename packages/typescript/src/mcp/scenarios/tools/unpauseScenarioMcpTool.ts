import { McpTool } from "../../tools/McpTool.ts";
import { scenariosMcpToolsShape } from "./scenariosMcpToolsShape.ts";

/**
 * Unpauses the active scenario or scenario recording.
 */
export const unpauseScenarioMcpTool = McpTool.define({
  ...scenariosMcpToolsShape.unpause,

  async execute(input, { scenarios, logger }) {
    const { scenarioId } = input;
    return scenarios.logWrapMethodResult(
      logger,
      `Unpausing active scenario recording (ID: ${scenarioId})`,
      () => scenarios.unpauseRecording(scenarioId),
    );
  },
});
