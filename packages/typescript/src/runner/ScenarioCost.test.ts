import { describe, expect, it } from "vitest";
import { createLlmUsage, type LlmUsage } from "../llm/llmSchema.ts";
import { createMcpTokenUsage } from "../mcp/mcpTokenUsage.ts";
import { ScenarioCost } from "./ScenarioCost.ts";

function createUsage(props: Partial<LlmUsage> = {}): LlmUsage {
  return { ...createLlmUsage(), ...props };
}

describe(ScenarioCost.mainAgent, () => {
  it("prices input and output tokens", () => {
    const usd = ScenarioCost.mainAgent({
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });

    expect(usd).toBeCloseTo(30, 10);
  });

  it("prices cache reads apart from input", () => {
    const usd = ScenarioCost.mainAgent({
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 1_000_000,
    });

    expect(usd).toBeCloseTo(0.5, 10);
  });

  it("prices the two cache write TTLs apart", () => {
    const usd = ScenarioCost.mainAgent({
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 2_000_000,
      cache_creation: {
        ephemeral_5m_input_tokens: 1_000_000,
        ephemeral_1h_input_tokens: 1_000_000,
      },
    });

    expect(usd).toBeCloseTo(16.25, 10);
  });

  it("bills every cache write at the 5m price when the breakdown is absent", () => {
    const usd = ScenarioCost.mainAgent({
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 1_000_000,
    });

    expect(usd).toBeCloseTo(6.25, 10);
  });

  it("does not double count a breakdown that only reports 1h writes", () => {
    const usd = ScenarioCost.mainAgent({
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 1_000_000,
      cache_creation: { ephemeral_1h_input_tokens: 1_000_000 },
    });

    expect(usd).toBeCloseTo(10, 10);
  });

  it("costs nothing for a session that spent no tokens", () => {
    expect(ScenarioCost.mainAgent({ input_tokens: 0, output_tokens: 0 })).toBe(
      0,
    );
  });
});

describe(ScenarioCost.alumnium, () => {
  it("prices input and output tokens", () => {
    const usd = ScenarioCost.alumnium({
      total: createUsage({
        input_tokens: 1_000_000,
        output_tokens: 1_000_000,
      }),
      cached: createUsage(),
    });

    expect(usd).toBeCloseTo(0.45, 10);
  });

  // NOTE: The two counters are disjoint - a cache hit never reaches the model, so
  // its tokens were never counted in `total`. Subtracting would discount them a
  // second time.
  it("does not discount the tokens the cache served", () => {
    const usd = ScenarioCost.alumnium({
      total: createUsage({
        input_tokens: 1_000_000,
        output_tokens: 1_000_000,
      }),
      cached: createUsage({ input_tokens: 750_000, output_tokens: 500_000 }),
    });

    expect(usd).toBeCloseTo(0.45, 10);
  });

  // NOTE: What a fully cached playback actually reports.
  it("costs nothing when the cache served every lookup", () => {
    const usd = ScenarioCost.alumnium({
      total: createUsage(),
      cached: createUsage({ input_tokens: 6476, output_tokens: 1012 }),
    });

    expect(usd).toBe(0);
  });
});

describe(ScenarioCost.alumniumSaved, () => {
  it("prices what the cache hits would have cost", () => {
    const usd = ScenarioCost.alumniumSaved({
      total: createUsage(),
      cached: createUsage({
        input_tokens: 1_000_000,
        output_tokens: 1_000_000,
      }),
    });

    expect(usd).toBeCloseTo(0.45, 10);
  });

  it("saves nothing when the cache served nothing", () => {
    const usd = ScenarioCost.alumniumSaved({
      total: createUsage({ input_tokens: 1_000_000 }),
      cached: createUsage(),
    });

    expect(usd).toBe(0);
  });
});

describe(ScenarioCost.of, () => {
  it("splits the total by the model that spent it", () => {
    const cost = ScenarioCost.of({
      mainAgent: { input_tokens: 1_000_000, output_tokens: 0 },
      alumnium: {
        total: createUsage({ input_tokens: 1_000_000 }),
        cached: createUsage(),
      },
    });

    expect(cost.mainUsd).toBeCloseTo(5, 10);
    expect(cost.alumniumUsd).toBeCloseTo(0.05, 10);
    expect(cost.totalUsd).toBeCloseTo(5.05, 10);
  });

  it("costs nothing on the main agent when no agent ran", () => {
    const cost = ScenarioCost.of({
      alumnium: {
        total: createUsage({ input_tokens: 1_000_000 }),
        cached: createUsage(),
      },
    });

    expect(cost.mainUsd).toBe(0);
    expect(cost.totalUsd).toBeCloseTo(0.05, 10);
  });

  it("costs nothing for a run that spent nothing", () => {
    const cost = ScenarioCost.of({ alumnium: createMcpTokenUsage() });

    expect(cost).toEqual({ mainUsd: 0, alumniumUsd: 0, totalUsd: 0 });
  });
});

describe(ScenarioCost.formatUsd, () => {
  it("shows four decimals", () => {
    expect(ScenarioCost.formatUsd(1.23456)).toBe("$1.2346");
  });

  it("shows a plain zero for a free run", () => {
    expect(ScenarioCost.formatUsd(0)).toBe("$0.0000");
  });

  it("does not round a cheap run down to free", () => {
    expect(ScenarioCost.formatUsd(0.00001)).toBe("<$0.0001");
  });
});
