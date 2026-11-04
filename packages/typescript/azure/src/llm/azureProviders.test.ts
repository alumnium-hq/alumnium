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

describe("Azure requests", () => {
  it.each([
    [
      "https://resource.openai.azure.com",
      "https://resource.openai.azure.com/openai/v1/responses?api-version=v1",
    ],
    [
      "https://example.services.ai.azure.com/",
      "https://example.services.ai.azure.com/openai/v1/responses",
    ],
  ])(
    "constructs a Responses API request for endpoint %s",
    async (endpoint, url) => {
      vi.stubEnv("AZURE_API_KEY", "azure-key");
      vi.stubEnv("AZURE_ENDPOINT", endpoint);
      Env.reset();

      const model = createAzureLlm({ provider: "azure", name: "gpt-6-luna" });
      await expect(model.doGenerate(OPTIONS)).rejects.toThrow(
        "request captured",
      );

      const [input, init] = vi.mocked(fetch).mock.calls[0] ?? [];
      expect(String(input)).toBe(url);
      expect(new Headers(init?.headers).get("api-key")).toBe("azure-key");
      expect(JSON.parse(String(init?.body))).toEqual(
        expect.objectContaining({
          model: "gpt-6-luna",
          reasoning: expect.objectContaining({ effort: "low" }),
        }),
      );
    },
  );

  it("requires the API key and endpoint", () => {
    expect(() =>
      createAzureLlm({ provider: "azure", name: "gpt-6-luna" }),
    ).toThrow(
      "AZURE_API_KEY environment variable is required for Azure models",
    );
  });
});
