import { McpTool } from "../../tools/McpTool.ts";
import { scenariosMcpToolsShape } from "./scenariosMcpToolsShape.ts";

/**
 * Pauses the running scenario or scenario recording.
 */
export const pauseScenarioMcpTool = McpTool.define({
  ...scenariosMcpToolsShape.pause,

  async execute(input, { scenarios, logger }) {
    const { scenarioId } = input;
    return scenarios.logWrapMethodResult(
      logger,
      `Pausing running scenario recording (ID: ${scenarioId})`,
      () => scenarios.pauseRecording(scenarioId),
    );
  },
});
