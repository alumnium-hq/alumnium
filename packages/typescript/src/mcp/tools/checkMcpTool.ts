import { txt } from "smollit";
import z from "zod";
import { AssertionError } from "../../client/errors/AssertionError.ts";
import { McpArtifactsStore } from "../McpArtifactsStore.ts";
import { McpState } from "../McpState.ts";
import { McpTool } from "./McpTool.ts";

/**
 * Execute Alumni.check().
 */
export const checkMcpTool = McpTool.define({
  name: "check",

  description: txt`
    Verify a statement is true about the current page. Returns the result and
    explanation.
  `,

  Input: McpTool.IdInput.extend({
    statement: z
      .string()
      .describe("Statement to verify (e.g., 'page title contains Dashboard')"),

    vision: z
      .boolean()
      .default(false)
      .describe("Use screenshot for verification"),
  }),

  async execute(input, { logger }) {
    const { id, statement, vision } = input;

    const al = McpState.getDriverAlumni(id);

    let explanation = "";
    let result = "";
    try {
      explanation = await al.check(statement, { vision });
      result = "success";
      logger.debug(`Success with ${explanation}`);
    } catch (error) {
      if (!(error instanceof AssertionError)) throw error;

      explanation = String(error);
      result = "failure";
      logger.error(`Failure with ${explanation}`);
    }

    await McpArtifactsStore.saveScreenshot({
      id,
      description: `check ${statement}`,
    });

    return [{ type: "text", text: JSON.stringify({ result, explanation }) }];
  },
});
