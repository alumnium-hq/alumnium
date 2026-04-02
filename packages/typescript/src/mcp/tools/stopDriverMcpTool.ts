import path from "node:path";
import z from "zod";
import { McpState } from "../McpState.ts";
import { McpTool } from "./McpTool.ts";

/**
 * Stop driver and cleanup.
 */
export const stopDriverMcpTool = McpTool.define("stop_driver", {
  description: "Close browser/app and cleanup driver resources.",

  inputSchema: z.object({
    driver_id: z.string(),

    save_cache: z
      .boolean()
      .default(false)
      .describe(
        "Save the Alumnium cache before stopping. This persists executed interactions for future use.",
      ),
  }),

  async execute(input, { logger }) {
    const driverId = String(input["driver_id"]);
    const saveCache = Boolean(input["save_cache"] || false);

    // Save cache if requested
    if (saveCache) {
      const al = McpState.getDriverAlumni(driverId);
      await al.cache.save();
      logger.info("Cache saved");
    }

    // Cleanup driver and get stats
    const [artifactsDir, stats] = await McpState.cleanupDriver(driverId);

    // Format stats message with detailed cache breakdown
    const message = `Driver ${driverId} closed.\nArtifacts saved to: ${path.resolve(artifactsDir)}\nToken usage statistics:\n- Total: ${stats["total"]["total_tokens"]} tokens (${stats["total"]["input_tokens"]} input, ${stats["total"]["output_tokens"]} output)\n- Cached: ${stats["cache"]["total_tokens"]} tokens (${stats["cache"]["input_tokens"]} input, ${stats["cache"]["output_tokens"]} output)`;

    return [{ type: "text", text: message }];
  },
});
