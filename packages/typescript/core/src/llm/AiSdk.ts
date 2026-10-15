import type {
  LanguageModelV4GenerateResult,
  LanguageModelV4ToolCall,
  LanguageModelV4Usage,
} from "@ai-sdk/provider";
import type { LlmUsage } from "./llmSchema.ts";

export namespace AiSdk {
  export type ToolCallInput =
    | { kind: "object"; value: Record<string, unknown> }
    | { kind: "empty" }
    | { kind: "non-object"; value: unknown }
    | { kind: "malformed" };
}

export abstract class AiSdk {
  static applyUsage(target: LlmUsage, usage: LanguageModelV4Usage): void {
    const input = usage.inputTokens.total ?? 0;
    const output = usage.outputTokens.total ?? 0;
    target.input_tokens += input;
    target.output_tokens += output;
    target.total_tokens += input + output;
    target.cache_read += usage.inputTokens.cacheRead ?? 0;
    target.cache_creation += usage.inputTokens.cacheWrite ?? 0;
    target.reasoning += usage.outputTokens.reasoning ?? 0;
  }

  static toolCalls(
    result: LanguageModelV4GenerateResult,
  ): LanguageModelV4ToolCall[] {
    return result.content.filter((part) => part.type === "tool-call");
  }

  static toolCallInput(toolCall: LanguageModelV4ToolCall): AiSdk.ToolCallInput {
    if (toolCall.input === "") return { kind: "empty" };

    try {
      const input: unknown = JSON.parse(toolCall.input);
      return input && typeof input === "object" && !Array.isArray(input)
        ? { kind: "object", value: input as Record<string, unknown> }
        : { kind: "non-object", value: input };
    } catch {
      return { kind: "malformed" };
    }
  }

  static toStored(
    result: LanguageModelV4GenerateResult,
  ): LanguageModelV4GenerateResult {
    const stored = structuredClone(result);
    if (stored.request) delete stored.request.body;
    if (stored.response) delete stored.response.body;
    return stored;
  }

  static fromStored(value: unknown): LanguageModelV4GenerateResult {
    if (!value || typeof value !== "object")
      throw new Error("Invalid cached result");
    const result = value as LanguageModelV4GenerateResult;
    if (
      !Array.isArray(result.content) ||
      !result.finishReason ||
      !result.usage?.inputTokens ||
      !result.usage.outputTokens ||
      !Array.isArray(result.warnings)
    ) {
      throw new Error("Invalid cached result");
    }
    if (result.response?.timestamp !== undefined) {
      const timestamp = new Date(result.response.timestamp);
      if (Number.isNaN(timestamp.getTime()))
        throw new Error("Invalid cached timestamp");
      result.response.timestamp = timestamp;
    }
    return result;
  }
}
