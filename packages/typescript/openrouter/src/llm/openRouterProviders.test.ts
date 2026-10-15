import type { LanguageModelV4CallOptions } from "@ai-sdk/provider";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Env } from "@alumnium/core/internal";
import { createOpenRouterLlm } from "./openRouterProviders.ts";

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
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  Env.reset();
});

describe("OpenRouter OpenRouter requests", () => {
  it("uses the OpenRouter endpoint and API key", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "openrouter-key");
    Env.reset();

    const model = createOpenRouterLlm({
      provider: "openrouter",
      name: "anthropic/claude-sonnet-4.5",
    });
    await expect(model.doGenerate(OPTIONS)).rejects.toThrow("request captured");

    const [input, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(String(input)).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer openrouter-key",
    );
    expect(JSON.parse(String(init?.body))).toEqual(
      expect.objectContaining({ model: "anthropic/claude-sonnet-4.5" }),
    );
  });
});
