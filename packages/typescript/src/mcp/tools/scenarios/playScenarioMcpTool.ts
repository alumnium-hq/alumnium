import { McpTool } from "../McpTool.ts";
import { scenariosMcpShape } from "./scenariosMcpShape.ts";

/**
 * Plays recorded scenario steps.
 */
export const playScenarioMcpTool = McpTool.define({
  ...scenariosMcpShape.play,

  async execute(input, { logger }) {
    return [
      {
        type: "text",
        text: JSON.stringify({}),
      },
    ];
  },
});
