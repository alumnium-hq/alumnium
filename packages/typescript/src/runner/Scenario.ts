import type {
  BetaToolResultBlockParam as ClaudeCodeToolResult,
  BetaToolUseBlock as ClaudeCodeToolUse,
} from "@anthropic-ai/sdk/resources/beta";
import { xxh64Str } from "smolxxh/str";
import z from "zod";
import { pathString } from "../utils/schema.ts";

export namespace Scenario {
  export type Id = z.infer<typeof Scenario.Id>;

  export type Base = z.infer<typeof Scenario.Base>;

  export type ClaudeCodeStepToolUse = ClaudeCodeToolUse;

  export type ClaudeCodeStepToolResult = ClaudeCodeToolResult;

  export type ClaudeCodeStepToolResultContent = ClaudeCodeToolResult["content"];

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

  static ClaudeCodeStep = z.union([this.ClaudeCodeStepToolUse]);

  static ClaudeCode = this.Base.extend({
    agent: z.literal("claude-code"),
    steps: z.array(this.ClaudeCodeStep),
  });

  static Schema = z.union([this.ClaudeCode]);

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
