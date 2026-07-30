import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import z from "zod";
import { Telemetry } from "../telemetry/Telemetry.ts";
import { jsonString } from "../utils/schema.ts";

const { logger } = Telemetry.get(import.meta.url);

export namespace ScenarioVerdict {
  export interface Type {
    status: "success" | "failure";
    /**
     * What happened, as the agent reported it: what the scenario verified when
     * it passed, what failed and how when it did not. Empty when a passing agent
     * left it empty; a failure always carries a reason, whether the agent's own
     * or the one it never got to report a verdict for.
     */
    details: string;
  }
}

/**
 * The pass/fail verdict a recording agent has to end with.
 *
 * The schema is handed to the Claude Code SDK as `outputFormat`, which turns it
 * into a `StructuredOutput` tool for the agent to call, and reports what it was
 * called with on the result message. The call itself is not a step of the
 * scenario, so it is left out of the console output - see `ScenarioReporter`.
 *
 * NOTE: Kept apart from `ScenarioRecorder` so it can be tested. The recorder
 * reaches for `bun` to find the Claude Code binary, and the unit tests run under
 * node, which cannot import it.
 */
export abstract class ScenarioVerdict {
  /**
   * The verdict as a schema the Claude Code SDK holds the agent to (see
   * `outputFormat` in `ScenarioRecorder`). The descriptions are what the agent
   * is shown, so they are where the verdict is defined.
   *
   * NOTE: Only `result` is strict. A field the agent adds on top is ignored
   * rather than invalidating an otherwise readable verdict, but an unknown
   * `result` fails the run instead of silently counting as a pass.
   */
  static Schema = z.object({
    result: z
      .enum(["success", "failure"])
      .describe(
        "Whether the test scenario passed. Use 'failure' when a step could not be performed, or a check or an assertion did not hold.",
      ),
    // NOTE: Optional, though the agent is asked for it either way: a passing run
    // is not worth throwing away over missing prose, and the reporter falls back
    // to the step count without it.
    details: z
      .string()
      .optional()
      .describe(
        "What happened, in one or two sentences: what the scenario did and verified when it passed, what failed and how when it did not. Always report it.",
      ),
  });

  /**
   * The same verdict as the text the agent's final message carries it in, so
   * that the raw JSON can be told apart from prose.
   */
  static Text = jsonString(ScenarioVerdict.Schema);

  /**
   * The verdict as the JSON Schema the SDK takes, so it stays defined once, in
   * zod.
   *
   * NOTE: The `$schema` key zod adds has to go. Claude Code rejects a schema
   * carrying it - silently, by offering the agent no `StructuredOutput` tool at
   * all, so the run ends up with no verdict rather than with an error saying the
   * schema was refused.
   */
  static jsonSchema(): Record<string, unknown> {
    const { $schema: _refused, ...schema } = z.toJSONSchema(
      ScenarioVerdict.Schema,
    );
    return schema;
  }

  /**
   * Reads the scenario verdict out of the message that ends a recording.
   *
   * A run that never reached a verdict counts as a failure just like a scenario
   * the agent found failing: a run whose outcome is unknown is not one to save.
   *
   * NOTE: Only a successful run carries `structured_output` - `SDKResultError`
   * has no such field - so every error subtype fails here, including
   * `error_max_structured_output_retries`, where the agent could not produce a
   * conforming verdict.
   *
   * NOTE: A run can also end successfully with no verdict at all: the schema is
   * only enforced once the agent calls `StructuredOutput`, and an agent that
   * signs off in prose instead is never made to call it. That fails too, rather
   * than having a verdict read out of the prose.
   *
   * @param message - Result message the Claude Code SDK ended the query with.
   * @returns The verdict, carrying the agent's account of the run, or the reason
   *   there is none.
   */
  static read(message: SDKResultMessage): ScenarioVerdict.Type {
    if (message.subtype !== "success")
      return failure(
        message.errors.length
          ? `Claude Code failed (${message.subtype}): ${message.errors.join("; ")}`
          : `Claude Code failed (${message.subtype})`,
      );

    const { structured_output } = message;
    if (structured_output === undefined)
      return failure(
        "Claude Code did not report the scenario result: the agent ended the run without calling the StructuredOutput tool",
      );

    const parseResult = ScenarioVerdict.Schema.safeParse(structured_output);
    if (!parseResult.success) {
      logger.debug(`Unreadable scenario result: {structured_output}`, {
        structured_output,
      });

      return failure(
        `Claude Code reported an unreadable scenario result: ${z.prettifyError(parseResult.error)}`,
      );
    }

    // NOTE: The reported details are the agent's own prose, so they go through
    // neither the masker nor the store - they are only printed and logged.
    const { result, details } = parseResult.data;
    const trimmedDetails = details?.trim() ?? "";

    if (result === "success")
      return { status: "success", details: trimmedDetails };

    return failure(trimmedDetails || "The agent reported the scenario failed");
  }
}

function failure(details: string): ScenarioVerdict.Type {
  return { status: "failure", details };
}
