import { describe, expect, it, vi } from "vitest";
import { Model } from "./Model.ts";

describe("Model.parse", () => {
  it("uses the provider's default model when only a provider is given", () => {
    expect(Model.parse("openai")).toEqual({
      provider: "openai",
      name: "gpt-5.6-luna",
    });
    expect(Model.parse("openrouter")).toEqual({
      provider: "openrouter",
      name: "openai/gpt-5.6-luna",
    });
  });

  it("uses the cursor provider's default model", () => {
    expect(Model.parse("cursor")).toEqual({
      provider: "cursor",
      name: "composer-2.5",
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

describe("Model.builder", () => {
  const llm = { specificationVersion: "v4" } as never;

  it("binds the provider's default model to its LLM", () => {
    const createLlm = vi.fn(() => llm);
    const model = Model.builder("openai", createLlm)();

    expect(model).toMatchObject({ provider: "openai", name: "gpt-5.6-luna" });
    expect(Model.hasProvider(model)).toBe(true);
    expect(createLlm).not.toHaveBeenCalled();
    expect(model.createLlm()).toBe(llm);
    expect(createLlm).toHaveBeenCalledWith({
      provider: "openai",
      name: "gpt-5.6-luna",
    });
  });

  it("uses the given model name", () => {
    const model = Model.builder("anthropic", () => llm)("claude-opus-4");
    expect(model).toMatchObject({
      provider: "anthropic",
      name: "claude-opus-4",
    });
  });

  it("leaves plain models without a provider", () => {
    expect(Model.hasProvider(Model.parse("openai"))).toBe(false);
  });
});

describe("Model.missingProviderError", () => {
  it("points to the provider package builder", () => {
    expect(
      Model.missingProviderError(Model.parse("aws_meta")).message,
    ).toContain(
      '`model: awsMeta("us.meta.llama4-maverick-17b-instruct-v1:0")` from "@alumnium/aws"',
    );
  });
});

describe("Model.resolver", () => {
  const llm = { specificationVersion: "v4" } as never;
  const openaiModule = {
    openai: Model.builder("openai", () => llm),
    createOpenAiLlm: () => llm,
    OPENAI_VERSION: "1",
  };
  const awsModule = {
    awsAnthropic: Model.builder("aws_anthropic", () => llm),
    awsMeta: Model.builder("aws_meta", () => llm),
  };

  it("binds models to the builders of the given modules", () => {
    const resolve = Model.resolver(openaiModule, awsModule);
    for (const model of ["openai/gpt-5.6-mini", "aws_anthropic", "aws_meta"]) {
      const resolved = resolve(Model.parse(model));
      expect(resolved).toMatchObject(Model.parse(model));
      expect(resolved.createLlm()).toBe(llm);
    }
  });

  it("keeps models already bound to a provider", () => {
    const model = Model.builder("google", () => llm)();
    expect(Model.resolver()(model)).toBe(model);
  });

  it("fails for providers without a builder", () => {
    expect(() => Model.resolver(openaiModule)(Model.parse("xai"))).toThrow(
      /from "@alumnium\/xai"/,
    );
  });
});
