import { McpTool } from "../McpTool.ts";
import { scenariosMcpShape } from "./scenariosMcpShape.ts";

/**
 * Commits the active scenario run.
 */
export const scenarioCommitMcpTool = McpTool.define({
  ...scenariosMcpShape.commit,

  async execute(input, { logger }) {
    return [
      {
        type: "text",
        text: JSON.stringify({}),
      },
    ];
  },
});
