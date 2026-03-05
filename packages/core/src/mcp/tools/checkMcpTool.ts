import z from "zod";
import { getLogger } from "../../utils/logger.js";
import { McpArtifacts } from "../McpArtifacts.js";
import { McpState } from "../McpState.js";
import { McpTool } from "./McpTool.js";

const logger = getLogger(import.meta.url);

/**
 * Execute Alumni.check().
 */
export const checkMcpTool = McpTool.define("check", {
  description:
    "Verify a statement is true about the current page. Returns the result and explanation.",

  inputSchema: z.object({
    driver_id: z.string(),

    statement: z
      .string()
      .describe("Statement to verify (e.g., 'page title contains Dashboard')"),

    vision: z
      .boolean()
      .default(false)
      .describe("Use screenshot for verification"),
  }),

  async execute(input) {
    const { driver_id: driverId, statement, vision } = input;

    logger.info(
      `Driver ${driverId}: Executing check('${statement}', vision=${vision})`,
    );

    const [al] = McpState.getDriver(driverId);

    let explanation = "";
    let result = "";
    try {
      explanation = await al.check(statement, { vision });
      result = "passed";
      logger.debug(`Driver ${driverId}: check() passed: ${explanation}`);
    } catch (error) {
      explanation = String(error);
      result = "failed";
      logger.debug(`Driver ${driverId}: check() failed: ${error}`);
    }

    await McpArtifacts.saveScreenshot({
      driverId,
      description: `check ${statement}`,
      al,
    });

    return [{ type: "text", text: `Check ${result}! ${explanation}` }];
  },
});
