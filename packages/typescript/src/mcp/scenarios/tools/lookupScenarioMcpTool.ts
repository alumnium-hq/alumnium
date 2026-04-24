import { stringExcerpt } from "../../../utils/string.ts";
import { McpTool } from "../../tools/McpTool.ts";
import { scenariosMcpToolsShape } from "./scenariosMcpToolsShape.ts";

/**
 * Looks up a scenario by its text.
 */
export const lookupScenarioMcpTool = McpTool.define({
  ...scenariosMcpToolsShape.lookup,

  async execute(input, { scenarios, logger }) {
    const { text } = input;
    return scenarios.logWrapMethodResult(
      logger,
      `Looking up scenario with text "${stringExcerpt(text, 25)}"`,
      () => scenarios.lookupScenario(text),
    );
  },
});
