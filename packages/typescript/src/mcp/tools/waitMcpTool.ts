import z from "zod";
import { AssertionError } from "../../client/errors/AssertionError.ts";
import { Params } from "../../Params.ts";
import { sleep } from "../../utils/timers.ts";
import { McpState } from "../McpState.ts";
import { McpTool } from "./McpTool.ts";

/**
 * Wait for seconds or a natural language condition.
 */
export const waitMcpTool = McpTool.define("wait", {
  description:
    "Wait for a specified duration or until a condition is met. Pass a number to wait that many seconds (1-30). Pass a string to wait for a natural language condition (e.g., 'My Account text', 'user is logged in', 'page shows success'). Uses AI-powered verification to check conditions. " +
    "When any value in the condition varies between runs, put a `{placeholder}` in the condition and pass the value in `params`; the condition is polled with the values substituted in.",

  inputSchema: z.object({
    id: z
      .string()
      .describe("Driver ID from start (required for condition-based waiting)")
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
      .default(10)
      .optional()
      .describe("Max seconds to wait for condition (default: 10, string only)"),

    params: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        'Values for the `{placeholder}` tokens in the condition, e.g. for \'the user {id} is listed\' with params {"id": "104478811"}. ' +
          "Only supported when `for` is a condition string, not a number of seconds. " +
          "Every placeholder in the condition must have a value here, and every value must be referenced by the condition.",
      ),
  }),

  async execute(input, { logger }) {
    const { for: waitFor, id, timeout: inputTimeout, params } = input;

    // If it's a number, wait that many seconds
    if (typeof waitFor === "number") {
      // NOTE: Rejected rather than ignored. A numeric wait has no text to
      // substitute into, so params here mean the caller expected something else
      // to happen - and `for: 7` with params `{"n": "7"}` would otherwise pass
      // validation and then be silently dropped.
      if (params && Object.keys(params).length) {
        return [
          {
            type: "text",
            text: JSON.stringify({
              error:
                "params is only supported when waiting for a condition, not a number of seconds",
            }),
          },
        ];
      }

      const seconds = Math.max(1, Math.min(30, Math.trunc(waitFor)));
      logger.info(`Waiting for ${seconds} seconds`);

      await sleep(seconds * 1000);
      return [
        { type: "text", text: JSON.stringify({ waited_seconds: seconds }) },
      ];
    }

    // Otherwise, treat as natural language condition
    if (!id) {
      return [
        {
          type: "text",
          text: JSON.stringify({
            error: "id is required when waiting for a condition",
          }),
        },
      ];
    }

    // NOTE: Substituted here, once, rather than handed to `al.check` on every
    // poll. `check` would re-validate each time round the loop, and would name
    // the text a statement in its errors when the caller wrote a condition.
    const boundParams = Params.from(params);
    boundParams.validate(waitFor, "condition");
    const condition = boundParams.substitute(waitFor);

    const timeout = typeof inputTimeout === "number" ? inputTimeout : 10;
    const pollInterval = 1.0;

    const al = McpState.getDriverAlumni(id);

    const startTime = Date.now();
    let lastError: string | undefined;
    let attempts = 0;

    while ((Date.now() - startTime) / 1000 < timeout) {
      attempts += 1;
      try {
        const explanation = await al.check(condition);
        logger.info(`Condition met after ${attempts} attempt(s)`);
        return [
          {
            type: "text",
            // NOTE: The substituted condition, not the placeholder form. The
            // output says what was verified against the page; the placeholder
            // form is already visible in the recorded input.
            text: JSON.stringify({
              status: "met",
              condition,
              explanation,
            }),
          },
        ];
      } catch (error) {
        if (
          !(error instanceof AssertionError) &&
          !(error instanceof Error && error.name === "AssertionError")
        ) {
          throw error;
        }
        lastError = String(error);
        logger.debug(`Condition not met after ${attempts} attempts(s)`);
        await sleep(pollInterval * 1000);
      }
    }

    logger.warn(`Timeout waiting for '${condition}'`);

    return [
      {
        type: "text",
        text: JSON.stringify({
          status: "timeout",
          condition,
          timeout_seconds: timeout,
          last_error: lastError,
        }),
      },
    ];
  },
});
