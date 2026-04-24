import { McpTool } from "../../tools/McpTool.ts";
import { scenariosMcpToolsShape } from "./scenariosMcpToolsShape.ts";

/**
 * Commits the active scenario recording.
 */
export const commitScenarioMcpTool = McpTool.define({
  ...scenariosMcpToolsShape.commit,

  async execute(input, { scenarios, logger }) {
    const { scenarioId } = input;
    return scenarios.logWrapMethodResult(
      logger,
      `Committing scenario recording (ID: ${scenarioId})`,
      () => scenarios.commitScenario(scenarioId),
    );
  },
});
