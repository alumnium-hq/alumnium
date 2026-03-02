import { always } from "alwaysly";
import z from "zod";
import { NativeClient } from "../../clients/NativeClient.js";
import { getLogger } from "../../utils/logger.js";
import { McpState } from "../McpState.js";
import { McpTool } from "./McpTool.js";

const logger = getLogger(import.meta.url);

/**
 * Fetch accessibility tree for debugging.
 */
export const fetchAccessibilityTreeMcpTool = McpTool.define(
  "fetch_accessibility_tree",
  {
    description:
      "Get structured representation of current page for debugging. Useful for understanding page structure or debugging.",

    inputSchema: z.object({
      driver_id: z.string(),
    }),

    async execute(input) {
      const { driver_id: driverId } = input;

      logger.debug(`Driver ${driverId}: Getting accessibility tree`);

      const [al] = McpState.getDriver(driverId);
      // Access the internal driver's accessibility tree
      // as if it's processed by Alumnium server
      const client = al.client;
      always(client instanceof NativeClient);
      const tree = client.session.processTree(
        (await al.driver.getAccessibilityTree()).toStr(),
      );

      return [{ type: "text", text: `Accessibility Tree:\n${tree.toXml()}` }];
    },
  },
);
