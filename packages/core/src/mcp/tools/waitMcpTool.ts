import z from "zod";
import { McpState } from "../McpState.js";
import { McpTool } from "./McpTool.js";

/**
 * Wait for seconds or a natural language condition.
 */
export const waitMcpTool = McpTool.define("wait", {
  description:
    "Wait for a specified duration or until a condition is met. Pass a number to wait that many seconds (1-30). Pass a string to wait for a natural language condition (e.g., 'My Account text', 'user is logged in', 'page shows success'). Uses AI-powered verification to check conditions.",

  inputSchema: z.object({
    driver_id: z
      .string()
      .describe(
        "Driver ID from start_driver (required for condition-based waiting)",
      )
      .optional(),

    for: z
      .union([
        z.number().describe("Seconds to wait (1-30)"),
        z.string().describe("Natural language condition to wait for"),
      ])
      .describe("Duration in seconds OR condition to wait for"),

    timeout: z
      .number()
      .int()
      .optional()
      .describe("Max seconds to wait for condition (default: 10, string only)"),
  }),

  async execute(input, { logger }) {
    const { for: waitFor, driver_id: driverId, timeout: inputTimeout } = input;

    // If it's a number, wait that many seconds
    if (typeof waitFor === "number") {
      const seconds = Math.max(1, Math.min(30, Math.trunc(waitFor)));
      logger.info(`Waiting for ${seconds} seconds`);
      await Bun.sleep(seconds * 1000);
      return [{ type: "text", text: `Waited ${seconds} seconds` }];
    }

    // Otherwise, treat as natural language condition
    if (!driverId) {
      return [
        {
          type: "text",
          text: "driver_id is required when waiting for a condition",
        },
      ];
    }

    const timeout = typeof inputTimeout === "number" ? inputTimeout : 10;
    const pollInterval = 1.0;

    const al = McpState.getDriverAlumni(driverId);

    const startTime = Date.now();
    let lastError: string | undefined;
    let attempts = 0;

    while ((Date.now() - startTime) / 1000 < timeout) {
      attempts += 1;
      try {
        const explanation = await al.check(waitFor);
        logger.info(`Condition met after ${attempts} attempt(s)`);
        return [
          { type: "text", text: `Condition met: ${waitFor}\n${explanation}` },
        ];
      } catch (error) {
        lastError = String(error);
        logger.debug(`Condition not met after ${attempts} attempts(s)`);
        await Bun.sleep(pollInterval * 1000);
      }
    }

    logger.warn(`Timeout waiting for '${waitFor}'`);

    return [
      {
        type: "text",
        text: `Timeout after ${timeout}s waiting for: ${waitFor}\nLast check: ${lastError}`,
      },
    ];
  },
});
