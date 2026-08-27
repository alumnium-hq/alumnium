import { describe, expect, it } from "vitest";
import { Model } from "./Model.ts";

describe("Model.parse", () => {
  it("uses the provider's default model when only a provider is given", () => {
    expect(Model.parse("openai")).toEqual({
      provider: "openai",
      name: "gpt-5-nano-2025-08-07",
    });
    expect(Model.parse("openrouter")).toEqual({
      provider: "openrouter",
      name: "openai/gpt-5-nano",
    });
  });

  it("parses a single-segment model name", () => {
    expect(Model.parse("openai/gpt-5")).toEqual({
      provider: "openai",
      name: "gpt-5",
    });
  });

  it("keeps slashes in the model name (e.g. OpenRouter/Fireworks ids)", () => {
    expect(Model.parse("openrouter/anthropic/claude-sonnet-4.5")).toEqual({
      provider: "openrouter",
      name: "anthropic/claude-sonnet-4.5",
    });
  });

  it("throws on an empty string", () => {
    expect(() => Model.parse("")).toThrow();
  });

  it("throws on an unknown provider", () => {
    expect(() => Model.parse("notaprovider/model")).toThrow();
  });
});

describe("Model.toString", () => {
  it("round-trips a model id whose name contains slashes", () => {
    const model = Model.parse("openrouter/anthropic/claude-sonnet-4.5");
    expect(Model.toString(model)).toBe(
      "openrouter/anthropic/claude-sonnet-4.5",
    );
    expect(Model.parse(Model.toString(model))).toEqual(model);
  });
});
