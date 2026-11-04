import { describe, expect, it, vi } from "vitest";
import { Model } from "./Model.ts";

describe("Model.parse", () => {
  it("uses the provider's default model when only a provider is given", () => {
    expect(Model.parse("openai")).toEqual({
      provider: "openai",
      name: "gpt-6-luna",
    });
    expect(Model.parse("openrouter")).toEqual({
      provider: "openrouter",
      name: "openai/gpt-6-luna",
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

    expect(model).toMatchObject({ provider: "openai", name: "gpt-6-luna" });
    expect(Model.hasProvider(model)).toBe(true);
    expect(createLlm).not.toHaveBeenCalled();
    expect(model.createLlm()).toBe(llm);
    expect(createLlm).toHaveBeenCalledWith({
      provider: "openai",
      name: "gpt-6-luna",
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

describe("Model.parse legacy providers", () => {
  it("maps deprecated AWS providers to aws with their default model", () => {
    expect(Model.parse("aws_anthropic")).toEqual({
      provider: "aws",
      name: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    });
    expect(Model.parse("aws_meta")).toEqual({
      provider: "aws",
      name: "us.meta.llama4-maverick-17b-instruct-v1:0",
    });
  });

  it("keeps explicit model names of deprecated AWS providers", () => {
    expect(Model.parse("aws_meta/us.meta.llama4-scout")).toEqual({
      provider: "aws",
      name: "us.meta.llama4-scout",
    });
  });
});

describe("Model.bedrockVendor", () => {
  it.each([
    ["us-gov.meta.llama4-maverick-17b-instruct-v1:0", "meta"],
    ["us.anthropic.claude-haiku-5-5", "anthropic"],
    ["global.openai.gpt-6-luna", "openai"],
    ["openai.gpt-6-luna", "openai"],
    ["zai.glm-5", "zai"],
  ])("returns vendor of %s", (name, vendor) => {
    expect(Model.bedrockVendor(name)).toBe(vendor);
  });
});

describe("Model.missingProviderError", () => {
  it("points to the provider package builder", () => {
    expect(Model.missingProviderError(Model.parse("aws")).message).toContain(
      '`model: aws("us.openai.gpt-6-luna")` from "@alumnium/aws"',
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
    aws: Model.builder("aws", () => llm),
  };

  it("binds models to the builders of the given modules", () => {
    const resolve = Model.resolver(openaiModule, awsModule);
    for (const model of ["openai/gpt-5.6-mini", "aws", "aws_meta"]) {
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
