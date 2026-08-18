import { describe, expect, it } from "vitest";
import { createLlmUsage, type LlmUsage } from "../llm/llmSchema.ts";
import {
  addMcpTokenUsage,
  createMcpTokenUsage,
  diffMcpTokenUsage,
  parseMcpTokenUsage,
  parseMcpTokenUsageOutput,
} from "./mcpTokenUsage.ts";

function createUsage(props: Partial<LlmUsage> = {}): LlmUsage {
  return { ...createLlmUsage(), ...props };
}

describe(parseMcpTokenUsageOutput, () => {
  it("parses usage reported by the stop tool", () => {
    const text = JSON.stringify({
      id: "test-driver",
      token_usage: {
        total: createUsage({ input_tokens: 900, output_tokens: 100 }),
        cached: createUsage({ input_tokens: 400 }),
      },
      cache_lookups: { hits: 9, misses: 1 },
    });

    expect(parseMcpTokenUsageOutput(text)).toEqual({
      total: createUsage({ input_tokens: 900, output_tokens: 100 }),
      cached: createUsage({ input_tokens: 400 }),
    });
  });

  it("ignores an output without usage", () => {
    expect(
      parseMcpTokenUsageOutput(JSON.stringify({ result: "success" })),
    ).toBeUndefined();
  });

  it("ignores usage missing a side", () => {
    const text = JSON.stringify({ token_usage: { total: createUsage() } });

    expect(parseMcpTokenUsageOutput(text)).toBeUndefined();
  });

  it("ignores usage with an incomplete side", () => {
    const text = JSON.stringify({
      token_usage: { total: { input_tokens: 900 }, cached: createUsage() },
    });

    expect(parseMcpTokenUsageOutput(text)).toBeUndefined();
  });

  it("ignores a non-JSON output", () => {
    expect(parseMcpTokenUsageOutput("stopped")).toBeUndefined();
  });

  it("ignores a non-object output", () => {
    expect(parseMcpTokenUsageOutput("4")).toBeUndefined();
  });
});

describe(parseMcpTokenUsage, () => {
  it("parses usage of a single call", () => {
    const usage = {
      total: createUsage({ input_tokens: 900 }),
      cached: createUsage(),
    };

    expect(parseMcpTokenUsage(usage)).toEqual(usage);
  });

  it("ignores a missing value", () => {
    expect(parseMcpTokenUsage(undefined)).toBeUndefined();
  });

  it("ignores a malformed value", () => {
    expect(parseMcpTokenUsage({ total: 900 })).toBeUndefined();
  });
});

describe(diffMcpTokenUsage, () => {
  it("reports what was spent between two readings", () => {
    const usage = diffMcpTokenUsage(
      {
        total: createUsage({ input_tokens: 100, total_tokens: 100 }),
        cached: createUsage(),
      },
      {
        total: createUsage({
          input_tokens: 900,
          output_tokens: 50,
          total_tokens: 950,
        }),
        cached: createUsage(),
      },
    );

    expect(usage?.total).toEqual(
      createUsage({ input_tokens: 800, output_tokens: 50, total_tokens: 850 }),
    );
  });

  // NOTE: A call the cache served spends nothing on `total` but does move
  // `cached`, and it is still a call that happened.
  it("reports a call the cache served", () => {
    const usage = diffMcpTokenUsage(
      { total: createUsage(), cached: createUsage() },
      {
        total: createUsage(),
        cached: createUsage({ input_tokens: 700, total_tokens: 700 }),
      },
    );

    expect(usage?.cached.total_tokens).toBe(700);
    expect(usage?.total.total_tokens).toBe(0);
  });

  it("reports nothing for a call that spent nothing", () => {
    const reading = {
      total: createUsage({ input_tokens: 900, total_tokens: 900 }),
      cached: createUsage(),
    };

    expect(diffMcpTokenUsage(reading, reading)).toBeUndefined();
  });
});

describe(addMcpTokenUsage, () => {
  it("sums both sides field by field", () => {
    const target = createMcpTokenUsage();

    addMcpTokenUsage(target, {
      total: createUsage({ input_tokens: 900, output_tokens: 100 }),
      cached: createUsage({ input_tokens: 400 }),
    });
    addMcpTokenUsage(target, {
      total: createUsage({ input_tokens: 100, cache_read: 7 }),
      cached: createUsage({ input_tokens: 50 }),
    });

    expect(target).toEqual({
      total: createUsage({
        input_tokens: 1000,
        output_tokens: 100,
        cache_read: 7,
      }),
      cached: createUsage({ input_tokens: 450 }),
    });
  });

  it("leaves a total untouched by an empty usage", () => {
    const target: ReturnType<typeof createMcpTokenUsage> = {
      total: createUsage({ input_tokens: 900 }),
      cached: createUsage(),
    };

    addMcpTokenUsage(target, createMcpTokenUsage());

    expect(target.total.input_tokens).toBe(900);
  });
});
