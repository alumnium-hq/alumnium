import { generateText } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Env } from "@alumnium/core/internal";
import { createAwsLlm } from "./awsProviders.ts";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("request captured");
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  Env.reset();
});

describe("AWS OpenAI requests", () => {
  it("requests low reasoning effort", async () => {
    vi.stubEnv("AWS_ACCESS_KEY", "access-key");
    vi.stubEnv("AWS_SECRET_KEY", "secret-key");
    vi.stubEnv("AWS_REGION_NAME", "us-east-1");
    Env.reset();

    const model = createAwsLlm({
      provider: "aws",
      name: "us.openai.gpt-6-luna",
    });
    await expect(
      generateText({ model, prompt: "hello", maxRetries: 0 }),
    ).rejects.toThrow();

    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(String(url)).toContain("us.openai.gpt-6-luna");
    const body = JSON.parse(String(init?.body));
    expect(body.additionalModelRequestFields).toMatchObject({
      reasoning: { effort: "low" },
    });
    expect(body.additionalModelRequestFields).not.toHaveProperty(
      "reasoningConfig",
    );
  });
});

describe("AWS Anthropic requests", () => {
  it("enables thinking", async () => {
    vi.stubEnv("AWS_ACCESS_KEY", "access-key");
    vi.stubEnv("AWS_SECRET_KEY", "secret-key");
    Env.reset();

    const model = createAwsLlm({
      provider: "aws",
      name: "us.anthropic.claude-haiku-5-5",
    });
    await expect(
      generateText({ model, prompt: "hello", maxRetries: 0 }),
    ).rejects.toThrow();

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body));
    expect(body.additionalModelRequestFields).toMatchObject({
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
    });
  });
});

describe("AWS requests for other vendors", () => {
  it("adds no vendor-specific fields", async () => {
    vi.stubEnv("AWS_ACCESS_KEY", "access-key");
    vi.stubEnv("AWS_SECRET_KEY", "secret-key");
    Env.reset();

    const model = createAwsLlm({ provider: "aws", name: "zai.glm-5" });
    await expect(
      generateText({ model, prompt: "hello", maxRetries: 0 }),
    ).rejects.toThrow();

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body));
    expect(body.additionalModelRequestFields).toBeUndefined();
  });
});
