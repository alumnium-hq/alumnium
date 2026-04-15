import { always } from "alwaysly";
import z from "zod";
import { NativeClient } from "../../clients/NativeClient.ts";
import { McpState } from "../McpState.ts";
import { McpTool } from "./McpTool.ts";

/**
 * Fetch accessibility tree for debugging.
 */
export const fetchAccessibilityTreeMcpTool = McpTool.define(
  "fetch_accessibility_tree",
  {
    description:
      "Get structured representation of current page for debugging. Useful for understanding page structure or debugging.",

    inputSchema: z.object({
      id: z.string(),
    }),

    async execute(input) {
      const { id } = input;

      const al = McpState.getDriverAlumni(id);
      // Access the internal driver's accessibility tree
      // as if it's processed by Alumnium server
      const client = al.client;
      always(client instanceof NativeClient);
      const tree = client.session.processTree(
        (await al.driver.getAccessibilityTree()).toStr(),
      );

      return [
        { type: "text", text: tree.toXml(client.session.excludeAttributes) },
      ];
    },
  },
);
