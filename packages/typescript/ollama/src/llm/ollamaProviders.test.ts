import type { LanguageModelV4CallOptions } from "@ai-sdk/provider";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Env } from "@alumnium/core/internal";
import { createOllamaLlm } from "./ollamaProviders.ts";

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

describe("Ollama Ollama requests", () => {
  it.each([
    [undefined, undefined, "http://127.0.0.1:11434/api/chat"],
    ["http://host:11434", undefined, "http://host:11434/api/chat"],
    ["http://host:11434/", undefined, "http://host:11434/api/chat"],
    ["http://host:11434/api", undefined, "http://host:11434/api/chat"],
    [
      "http://preferred:11434",
      "http://fallback:11434",
      "http://preferred:11434/api/chat",
    ],
  ])(
    "uses OLLAMA_HOST=%s and ALUMNIUM_OLLAMA_URL=%s",
    async (ollamaHost, alumniumURL, expectedURL) => {
      vi.stubEnv("OLLAMA_HOST", ollamaHost);
      vi.stubEnv("ALUMNIUM_OLLAMA_URL", alumniumURL);
      Env.reset();

      const model = createOllamaLlm({
        provider: "ollama",
        name: "test-model",
      });
      await expect(model.doGenerate(OPTIONS)).rejects.toThrow(
        "request captured",
      );

      expect(fetch).toHaveBeenCalledWith(expectedURL, expect.anything());
    },
  );
});
