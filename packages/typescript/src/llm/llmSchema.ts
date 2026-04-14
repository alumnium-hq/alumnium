import z from "zod";

export const LlmUsage = z.object({
  // Input (prompt) tokens.
  input_tokens: z.number(),
  // Output (completion) tokens.
  output_tokens: z.number(),
  // Total tokens (input + output).
  total_tokens: z.number(),
  // LLM cache creation tokens. These are input tokens that were used to create
  // LLM cache entry.
  cache_creation: z.number(),
  // LLM cache read tokens. These are input tokens that were matched from
  // the LLM cache and not sent to the model.
  cache_read: z.number(),
  // Reasoning tokens.
  reasoning: z.number(),
});

export type LlmUsage = z.infer<typeof LlmUsage>;

export function createLlmUsage(): LlmUsage {
  return {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    cache_creation: 0,
    cache_read: 0,
    reasoning: 0,
  };
}

export const LlmUsageStats = z.object({
  total: LlmUsage,
  cache: LlmUsage,
});

export type LlmUsageStats = z.infer<typeof LlmUsageStats>;

export function createLlmUsageStats(): LlmUsageStats {
  return {
    total: createLlmUsage(),
    cache: createLlmUsage(),
  };
}
