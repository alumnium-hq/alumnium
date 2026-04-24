import { txt } from "smollit";
import z from "zod";
import { McpArtifactsStore } from "../McpArtifactsStore.ts";
import { McpState } from "../McpState.ts";
import { McpTool } from "./McpTool.ts";

/**
 * Execute Alumni.get().
 */
export const getMcpTool = McpTool.define({
  name: "get",

  description: txt`
    Extract data from the page (e.g., 'user name', 'product prices',
    'item count'). Returns the extracted data if it's available or explanation
    why it can't be extracted.
  `,

  Input: z.object({
    id: z.string(),

    data: z.string().describe("Description of data to extract"),

    vision: z
      .boolean()
      .default(false)
      .describe("Use screenshot for extraction"),
  }),

  async execute(input) {
    const { id, data, vision } = input;

    const al = McpState.getDriverAlumni(id);
    const result = await al.get(data, { vision });

    await McpArtifactsStore.saveScreenshot({
      id,
      description: `get ${data}`,
    });

    return result;
  },
});
