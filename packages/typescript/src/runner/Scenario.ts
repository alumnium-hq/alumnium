import type {
  BetaToolResultBlockParam as ClaudeCodeToolResult,
  BetaToolUseBlock as ClaudeCodeToolUse,
} from "@anthropic-ai/sdk/resources/beta";
import { xxh64Str } from "smolxxh/str";
import z from "zod";
import { pathString } from "../utils/schema.ts";
import type { ScenarioVerdict } from "./ScenarioVerdict.ts";

export namespace Scenario {
  export type Id = z.infer<typeof Scenario.Id>;

  export type Base = z.infer<typeof Scenario.Base>;

  export type ClaudeCodeStepToolUse = ClaudeCodeToolUse;

  export type ClaudeCodeStepToolResult = ClaudeCodeToolResult;

  export type ClaudeCodeStepToolResultContent = ClaudeCodeToolResult["content"];

  export type ClaudeCodeMcpStep = z.infer<
    typeof Scenario.ClaudeCodeStepToolUse
  >;

  export type ClaudeCodeExternalStep = z.infer<
    typeof Scenario.ClaudeCodeStepExternalToolUse
  >;

  export type ClaudeCodeNarrationStep = z.infer<
    typeof Scenario.ClaudeCodeStepNarration
  >;

  export type ClaudeCodeStep = z.infer<typeof Scenario.ClaudeCodeStep>;

  export type ClaudeCode = z.infer<typeof Scenario.ClaudeCode>;

  export type Type = z.infer<typeof Scenario.Schema>;

  export type MaskMap = Record<string, string>;
}

export abstract class Scenario {
  static Id = z.string().brand("Scenario.Id");

  static Base = z.object({
    id: this.Id,
    text: z.string(),
    path: pathString(),
  });

  static ClaudeCodeStepToolUse = z.object({
    kind: z.literal("tool-use"),
    use: z.custom<Scenario.ClaudeCodeStepToolUse>((value) => value),
    result: z.custom<Scenario.ClaudeCodeStepToolResult>((value) => value),
  });

  /**
   * A non-Alumnium tool call (e.g. `Bash`) made by the agent. Recorded so that
   * playback can re-execute it, since its output can feed later MCP tool
   * inputs.
   */
  static ClaudeCodeStepExternalToolUse = z.object({
    kind: z.literal("external-tool-use"),
    use: z.custom<Scenario.ClaudeCodeStepToolUse>((value) => value),
    result: z.custom<Scenario.ClaudeCodeStepToolResult>((value) => value),
  });

  /**
   * Something the agent said rather than did: a piece of its thinking, or a
   * message meant for the person running the test. Recorded so that a playback
   * reads like the recording it came from, and never executed.
   *
   * NOTE: This is the agent's own prose, and it is stored as it was written.
   * Unlike a tool input, it does not go through `ScenarioMasker` - masking
   * matches whole values and quoted tokens, neither of which is how prose
   * mentions a value - so a recording can carry a value the agent happened to
   * write out.
   */
  static ClaudeCodeStepNarration = z.object({
    kind: z.literal("narration"),
    narration: z.enum(["thinking", "assistant"]),
    text: z.string(),
  });

  static ClaudeCodeStep = z.union([
    this.ClaudeCodeStepToolUse,
    this.ClaudeCodeStepExternalToolUse,
    this.ClaudeCodeStepNarration,
  ]);

  static ClaudeCode = this.Base.extend({
    agent: z.literal("claude-code"),
    steps: z.array(this.ClaudeCodeStep),
    // NOTE: Optional, so that a recording made before the verdict was stored
    // still loads. Playback then has nothing to report but the step count.
    verdict: z.custom<ScenarioVerdict.Type>((value) => value).optional(),
  });

  static Schema = z.union([this.ClaudeCode]);

  /**
   * Number of steps a playback executes, which is everything the agent did as
   * opposed to said. This is the count a run is reported with, so that adding
   * narration to a recording doesn't inflate it.
   *
   * @param scenario - Scenario to count the steps of.
   * @returns Number of executable steps.
   */
  static executableStepsCount(scenario: Scenario.Type): number {
    return scenario.steps.filter((step) => step.kind !== "narration").length;
  }

  /**
   * Tells whether a recorded tool result is one the tool reported as failed.
   *
   * Both phases read an external call's outcome through here, and they have to
   * agree: recording registers no values for a failed call and playback skips it
   * altogether, so a phase reading the outcome differently would leave the other
   * one's masks pointing at a call that produced nothing.
   *
   * NOTE: Only the flag, deliberately. An external tool's output is arbitrary -
   * a JSON body with an `errorMessage` in it, a command that printed a complaint
   * and exited 0 - and treating any of that as a failure would stop the recorded
   * call from being replayed at all. The flag is what the agent sets when the
   * call itself failed, and nothing else is that unambiguous.
   *
   * @param result - Recorded tool result.
   * @returns `true` when the call was flagged as failed.
   */
  static isFailedToolResult(
    result: Scenario.ClaudeCodeStepToolResult,
  ): boolean {
    return Boolean(result.is_error);
  }

  /**
   * Converts scenario text to a scenario ID using a hash function.
   *
   * @param text - Scenario text to convert to ID.
   * @returns Scenario ID generated from the input text.
   */
  static textToId(text: string): Scenario.Id {
    const trimmedText = text.trim();
    return xxh64Str(trimmedText);
  }
}
