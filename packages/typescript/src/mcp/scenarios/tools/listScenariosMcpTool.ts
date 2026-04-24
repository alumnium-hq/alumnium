import { McpTool } from "../../tools/McpTool.ts";
import { scenariosMcpToolsShape } from "./scenariosMcpToolsShape.ts";

/**
 * Lists all recorded scenarios.
 */
export const listScenariosMcpTool = McpTool.define({
  ...scenariosMcpToolsShape.list,

  async execute(_input, { scenarios, logger }) {
    return scenarios.logWrapMethodResult(
      logger,
      `Listing all recorded scenarios`,
      () => scenarios.listScenarios(),
    );
  },
});
