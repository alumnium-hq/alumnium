import { describe, expect, it } from "vitest";
import {
  createLlmUsage,
  createLlmUsageStats,
  diffLlmUsageStats,
  subtractLlmUsage,
} from "./llmSchema.ts";

describe("subtractLlmUsage", () => {
  it("computes the per-call delta between two cumulative snapshots", () => {
    const before = {
      ...createLlmUsage(),
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
    };
    const after = {
      ...createLlmUsage(),
      input_tokens: 25,
      output_tokens: 12,
      total_tokens: 37,
      reasoning: 4,
    };

    expect(subtractLlmUsage(after, before)).toEqual({
      input_tokens: 15,
      output_tokens: 7,
      total_tokens: 22,
      cache_creation: 0,
      cache_read: 0,
      reasoning: 4,
    });
  });

  it("returns zeros when nothing changed", () => {
    const usage = { ...createLlmUsage(), input_tokens: 3 };
    expect(subtractLlmUsage(usage, usage)).toEqual(createLlmUsage());
  });
});

describe("diffLlmUsageStats", () => {
  it("diffs total and cache separately, exposing cache as cached", () => {
    const before = createLlmUsageStats();
    const after = createLlmUsageStats();
    after.total.input_tokens = 30;
    after.total.total_tokens = 40;
    after.cache.input_tokens = 12;
    after.cache.total_tokens = 15;

    const tokens = diffLlmUsageStats(after, before);

    expect(tokens.total.total_tokens).toBe(40);
    expect(tokens.cached.input_tokens).toBe(12);
    expect(tokens.cached.total_tokens).toBe(15);
  });
});
