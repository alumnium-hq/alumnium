import type { LanguageModelV4CallOptions } from "@ai-sdk/provider";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Env } from "@alumnium/core/internal";
import { createAzureLlm } from "./azureProviders.ts";

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

describe("Azure Azure requests", () => {
  it("constructs a Foundry request with version, target query, auth, and model", async () => {
    vi.stubEnv("AZURE_FOUNDRY_API_KEY", "foundry-key");
    vi.stubEnv(
      "AZURE_FOUNDRY_TARGET_URI",
      "https://example.services.ai.azure.com",
    );
    Env.reset();

    const model = createAzureLlm({
      provider: "azure_foundry",
      name: "foundry-model",
    });
    await expect(model.doGenerate(OPTIONS)).rejects.toThrow("request captured");

    const [input, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const url = new URL(String(input));
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://example.services.ai.azure.com/openai/responses",
    );
    expect(new Headers(init?.headers).get("api-key")).toBe("foundry-key");
    expect(JSON.parse(String(init?.body))).toEqual(
      expect.objectContaining({ model: "foundry-model" }),
    );
  });

  it("keeps Azure OpenAI deployment request construction separate", async () => {
    vi.stubEnv("AZURE_OPENAI_API_KEY", "openai-key");
    vi.stubEnv("AZURE_OPENAI_ENDPOINT", "https://resource.openai.azure.com");
    Env.reset();

    const model = createAzureLlm({
      provider: "azure_openai",
      name: "openai-model",
    });
    await expect(model.doGenerate(OPTIONS)).rejects.toThrow("request captured");

    const [input, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(String(input)).toBe(
      "https://resource.openai.azure.com/openai/v1/responses?api-version=v1",
    );
    expect(new Headers(init?.headers).get("api-key")).toBe("openai-key");
  });
});
