import type { LanguageModelV4CallOptions } from "@ai-sdk/provider";
import { generateText, Output } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import z from "zod";
import { Env } from "../Env.ts";
import { LlmFactory } from "./LlmFactory.ts";

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

describe("LlmFactory Ollama requests", () => {
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

      const model = LlmFactory.createOllamaLlm({
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

describe("LlmFactory Azure requests", () => {
  it("constructs a Foundry request with version, target query, auth, and model", async () => {
    vi.stubEnv("AZURE_FOUNDRY_API_KEY", "foundry-key");
    vi.stubEnv("AZURE_FOUNDRY_API_VERSION", "2024-05-01-preview");
    vi.stubEnv(
      "AZURE_FOUNDRY_TARGET_URI",
      "https://example.services.ai.azure.com/models?feature=enabled&api-version=2024-05-01-preview",
    );
    Env.reset();

    const model = LlmFactory.createAzureLlm({
      provider: "azure_foundry",
      name: "foundry-model",
    });
    await expect(model.doGenerate(OPTIONS)).rejects.toThrow("request captured");

    const [input, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const url = new URL(String(input));
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://example.services.ai.azure.com/models/chat/completions",
    );
    expect(url.searchParams.get("feature")).toBe("enabled");
    expect(url.searchParams.getAll("api-version")).toEqual([
      "2024-05-01-preview",
    ]);
    expect(new Headers(init?.headers).get("api-key")).toBe("foundry-key");
    expect(JSON.parse(String(init?.body))).toEqual(
      expect.objectContaining({ model: "foundry-model" }),
    );
  });

  it("keeps Azure OpenAI deployment request construction separate", async () => {
    vi.stubEnv("AZURE_OPENAI_API_KEY", "openai-key");
    vi.stubEnv("AZURE_OPENAI_ENDPOINT", "https://resource.openai.azure.com");
    vi.stubEnv("AZURE_OPENAI_API_VERSION", "2025-04-01-preview");
    Env.reset();

    const model = LlmFactory.createAzureLlm({
      provider: "azure_openai",
      name: "openai-model",
    });
    await expect(model.doGenerate(OPTIONS)).rejects.toThrow("request captured");

    const [input, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(String(input)).toBe(
      "https://resource.openai.azure.com/openai/deployments/openai-model/chat/completions?api-version=2025-04-01-preview",
    );
    expect(new Headers(init?.headers).get("api-key")).toBe("openai-key");
  });
});

describe("LlmFactory AWS Meta requests", () => {
  it("does not force the schema tool for structured output", async () => {
    vi.stubEnv("AWS_ACCESS_KEY", "access-key");
    vi.stubEnv("AWS_SECRET_KEY", "secret-key");
    vi.stubEnv("AWS_REGION_NAME", "us-east-1");
    Env.reset();
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          output: {
            message: {
              role: "assistant",
              content: [
                {
                  toolUse: {
                    toolUseId: "tool-1",
                    name: "json",
                    input: { answer: 42 },
                  },
                },
              ],
            },
          },
          stopReason: "tool_use",
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );

    const model = LlmFactory.createAwsLlm({
      provider: "aws_meta",
      name: "us.meta.llama4-maverick-17b-instruct-v1:0",
    });
    const result = await generateText({
      model,
      prompt: "answer the question",
      output: Output.object({
        schema: z.object({ answer: z.number() }),
      }),
    });

    expect(result.output).toEqual({ answer: 42 });
    expect(result.finishReason).toBe("stop");
    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body));
    expect(body.toolConfig).toEqual({
      tools: [
        {
          toolSpec: expect.objectContaining({
            name: "json",
          }),
        },
      ],
    });
  });
});
