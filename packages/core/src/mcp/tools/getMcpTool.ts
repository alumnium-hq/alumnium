import z from "zod";
import { McpArtifactsStore } from "../McpArtifactsStore.js";
import { McpState } from "../McpState.js";
import { McpTool } from "./McpTool.js";

/**
 * Execute Alumni.get().
 */
export const getMcpTool = McpTool.define("get", {
  description:
    "Extract data from the page (e.g., 'user name', 'product prices', 'item count'). Returns the extracted data if it's available or explanation why it can't be extracted.",

  inputSchema: z.object({
    driver_id: z.string(),

    data: z.string().describe("Description of data to extract"),

    vision: z
      .boolean()
      .default(false)
      .describe("Use screenshot for extraction"),
  }),

  async execute(input) {
    const { driver_id: driverId, data, vision } = input;

    const al = McpState.getDriverAlumni(driverId);
    const result = await al.get(data, { vision });

    await McpArtifactsStore.saveScreenshot({
      driverId,
      description: `get ${data}`,
    });

    return [{ type: "text", text: String(result) }];
  },
});
