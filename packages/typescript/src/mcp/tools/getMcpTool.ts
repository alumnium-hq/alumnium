import z from "zod";
import { McpArtifactsStore } from "../McpArtifactsStore.ts";
import { McpState } from "../McpState.ts";
import { McpTool } from "./McpTool.ts";

/**
 * Execute Alumni.get().
 */
export const getMcpTool = McpTool.define("get", {
  description:
    "Extract data from the page (e.g., 'user name', 'product prices', 'item count'). Returns the extracted data if it's available or explanation why it can't be extracted. " +
    "When any value in the description varies between runs, put a `{placeholder}` in it and pass the value in `params` instead of inlining it, so the description stays the same text across runs.",

  inputSchema: z.object({
    id: z.string(),

    data: z.string().describe("Description of data to extract"),

    vision: z
      .boolean()
      .default(false)
      .describe("Use screenshot for extraction"),

    params: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        'Values for the `{placeholder}` tokens in the data description, e.g. data \'the status of order {order_id}\' with params {"order_id": "A-77"}. ' +
          "Every placeholder in the description must have a value here, and every value must be referenced by the description.",
      ),
  }),

  async execute(input) {
    const { id, data, vision, params } = input;

    const al = McpState.getDriverAlumni(id);
    const result = await al.get(data, { vision, params });

    await McpArtifactsStore.saveScreenshot({
      id,
      description: `get ${data}`,
    });

    return [{ type: "text", text: JSON.stringify(result) }];
  },
});
