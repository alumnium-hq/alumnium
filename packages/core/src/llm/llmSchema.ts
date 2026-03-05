import z from "zod";

export const LlmUsage = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  total_tokens: z.number(),
});

export type LlmUsage = z.infer<typeof LlmUsage>;

export function createLlmUsage(): LlmUsage {
  return {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
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

export const LlmGeneration = z.object({
  text: z.string(),
  message: z.object({
    content: z.string(),
    usage_metadata: LlmUsage,
  }),
});

export type LlmGeneration = z.infer<typeof LlmGeneration>;
