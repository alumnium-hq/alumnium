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

/**
 * Compute the per-call token usage as the difference between two cumulative
 * usage snapshots (taken before and after an agent invocation).
 */
export function subtractLlmUsage(after: LlmUsage, before: LlmUsage): LlmUsage {
  const delta = createLlmUsage();
  (Object.keys(delta) as (keyof LlmUsage)[]).forEach((key) => {
    delta[key] = after[key] - before[key];
  });
  return delta;
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

/**
 * Per-call token usage reported to clients. `cached` is the part of `total`
 * that was replayed from the Alumnium response cache and not billed by the
 * model provider, so paid tokens are `total - cached`.
 */
export const LlmTokens = z.object({
  total: LlmUsage,
  cached: LlmUsage,
});

export type LlmTokens = z.infer<typeof LlmTokens>;

/**
 * Compute the per-call tokens as the difference between two cumulative
 * session stats snapshots (taken before and after an agent invocation).
 */
export function diffLlmUsageStats(
  after: LlmUsageStats,
  before: LlmUsageStats,
): LlmTokens {
  return {
    total: subtractLlmUsage(after.total, before.total),
    cached: subtractLlmUsage(after.cache, before.cache),
  };
}
