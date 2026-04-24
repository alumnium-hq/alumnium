import { McpTool } from "../../tools/McpTool.ts";
import { scenariosMcpToolsShape } from "./scenariosMcpToolsShape.ts";

/**
 * Starts a new scenario steps recording.
 */
export const recordScenarioMcpTool = McpTool.define({
  ...scenariosMcpToolsShape.record,

  async execute(input, { scenarios, logger }) {
    const { text } = input;
    return scenarios.logWrapMethodResult(logger, "Scenario recording", () =>
      scenarios.startRecording(text),
    );
  },
});
