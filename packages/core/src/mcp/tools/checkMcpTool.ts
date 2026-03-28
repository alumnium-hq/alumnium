import z from "zod";
import { AssertionError } from "../../client/errors/AssertionError.js";
import { McpArtifactsStore } from "../McpArtifactsStore.js";
import { McpState } from "../McpState.js";
import { McpTool } from "./McpTool.js";

/**
 * Execute Alumni.check().
 */
export const checkMcpTool = McpTool.define("check", {
  description:
    "Verify a statement is true about the current page. Returns the result and explanation.",

  inputSchema: McpTool.DriverInput.extend({
    statement: z
      .string()
      .describe("Statement to verify (e.g., 'page title contains Dashboard')"),

    vision: z
      .boolean()
      .default(false)
      .describe("Use screenshot for verification"),
  }),

  async execute(input, { logger }) {
    const { driver_id: driverId, statement, vision } = input;

    const al = McpState.getDriverAlumni(driverId);

    let explanation = "";
    let result = "";
    try {
      explanation = await al.check(statement, { vision });
      result = "passed";
      logger.debug(`Passed with ${explanation}`);
    } catch (error) {
      if (!(error instanceof AssertionError)) throw error;

      explanation = String(error);
      result = "failed";
      logger.error(`Failed with ${explanation}`);
    }

    await McpArtifactsStore.saveScreenshot({
      driverId,
      description: `check ${statement}`,
    });

    return [{ type: "text", text: `Check ${result}! ${explanation}` }];
  },
});
