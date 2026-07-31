import z from "zod";
import { AssertionError } from "../../client/errors/AssertionError.ts";
import { McpArtifactsStore } from "../McpArtifactsStore.ts";
import { McpState } from "../McpState.ts";
import { McpTool } from "./McpTool.ts";

/**
 * Execute Alumni.check().
 */
export const checkMcpTool = McpTool.define("check", {
  description:
    "Verify a statement is true about the current page. Returns the result and explanation. " +
    "When any value in the statement varies between runs (an id, an email, something produced by an earlier tool), put a `{placeholder}` in the statement and pass the value in `params` instead of inlining it — this keeps the statement text stable so a later run can re-verify it against a fresh value.",

  inputSchema: McpTool.WithDriverId.extend({
    statement: z
      .string()
      .describe("Statement to verify (e.g., 'page title contains Dashboard')"),

    vision: z
      .boolean()
      .default(false)
      .describe("Use screenshot for verification"),

    params: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        'Values for the `{placeholder}` tokens in the statement, e.g. statement \'the user {email} is shown\' with params {"email": "test1@email.com"}. ' +
          "The statement is verified with the values substituted in, so the page really is checked against them — nothing is reused from a previous value. " +
          "Every placeholder in the statement must have a value here, and every value must be referenced by the statement.",
      ),
  }),

  async execute(input, { logger }) {
    const { id, statement, vision, params } = input;

    const al = McpState.getDriverAlumni(id);

    let explanation = "";
    let result = "";
    try {
      explanation = await al.check(statement, { vision, params });
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
