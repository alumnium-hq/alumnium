import { describe, expect, it } from "vitest";
import { createLlmUsage, subtractLlmUsage } from "./llmSchema.ts";

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
