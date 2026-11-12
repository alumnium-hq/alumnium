import type { LanguageModelV4CallOptions } from "@ai-sdk/provider";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Env } from "@alumnium/core/internal";
import { createOpenAiLlm } from "./openAiProviders.ts";

const OPTIONS: LanguageModelV4CallOptions = {
  prompt: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("request captured");
    }),
  );
  vi.stubEnv("OPENAI_API_KEY", "openai-key");
  vi.stubEnv("OPENAI_CUSTOM_URL", "https://gateway.example.com/v1");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  Env.reset();
});

describe("OpenAI requests", () => {
  it.each([
    [undefined, "low"],
    ["medium", "medium"],
    ["high", "high"],
  ])(
    "sends OPENAI_REASONING_EFFORT %s as reasoning effort %s",
    async (value, effort) => {
      vi.stubEnv("OPENAI_REASONING_EFFORT", value);
      Env.reset();

      const body = await capturedBody("gpt-5.6-luna");

      expect(body).toEqual(
        expect.objectContaining({
          model: "gpt-5.6-luna",
          reasoning_effort: effort,
        }),
      );
    },
  );

  it("sends no reasoning effort for gpt-4o models", async () => {
    vi.stubEnv("OPENAI_REASONING_EFFORT", "medium");
    Env.reset();

    const body = await capturedBody("gpt-4o-mini");

    expect(body).not.toHaveProperty("reasoning_effort");
  });
});

async function capturedBody(name: string): Promise<unknown> {
  const model = createOpenAiLlm({ provider: "openai", name });
  await expect(model.doGenerate(OPTIONS)).rejects.toThrow("request captured");
  const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
  return JSON.parse(String(init?.body));
}
