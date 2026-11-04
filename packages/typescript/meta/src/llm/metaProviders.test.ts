import type { LanguageModelV4CallOptions } from "@ai-sdk/provider";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Env } from "@alumnium/core/internal";
import { createMetaLlm } from "./metaProviders.ts";

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

describe("Meta requests", () => {
  it("constructs a Responses API request with auth, model and reasoning", async () => {
    vi.stubEnv("META_API_KEY", "meta-key");
    Env.reset();

    const model = createMetaLlm({
      provider: "meta",
      name: "muse-spark-1.3-contributor",
    });
    await expect(model.doGenerate(OPTIONS)).rejects.toThrow("request captured");

    const [input, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(String(input)).toBe("https://api.meta.ai/v1/responses");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer meta-key",
    );
    expect(JSON.parse(String(init?.body))).toEqual(
      expect.objectContaining({
        model: "muse-spark-1.3-contributor",
        reasoning: expect.objectContaining({ effort: "low" }),
      }),
    );
  });
});
