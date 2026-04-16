import { McpTool } from "../McpTool.ts";
import { scenariosMcpShape } from "./scenariosMcpShape.ts";

/**
 * Looks up a scenario by its text.
 */
export const lookupScenarioMcpTool = McpTool.define({
  ...scenariosMcpShape.lookup,

  async execute(input, { logger }) {
    return [
      {
        type: "text",
        text: JSON.stringify({}),
      },
    ];
  },
});
