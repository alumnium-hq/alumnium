import { McpTool } from "../McpTool.ts";
import { scenariosMcpShape } from "./scenariosMcpShape.ts";

/**
 * Starts a new scenario steps recording.
 */
export const recordScenarioMcpTool = McpTool.define({
  ...scenariosMcpShape.record,

  async execute(input, { logger }) {
    return [
      {
        type: "text",
        text: JSON.stringify({}),
      },
    ];
  },
});
