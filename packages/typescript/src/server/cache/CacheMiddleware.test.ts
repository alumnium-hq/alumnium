import type { LanguageModelV4CallOptions } from "@ai-sdk/provider";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { AiSdkFactory } from "../../llm/__factories__/AiSdkFactory.ts";
import { SessionFactory } from "../session/__factories__/SessionFactory.ts";
import { createCacheMiddleware } from "./CacheMiddleware.ts";
import { ServerCache } from "./ServerCache.ts";

describe(createCacheMiddleware, () => {
  it("returns hits without generation and strips internal provider options", async () => {
    const hit = AiSdkFactory.generateResult({ text: "cached" });
    const cache = new MockCache(hit);
    const middleware = createCacheMiddleware(cache);
    const params = paramsWithMeta();
    const transformed = await middleware.transformParams!({
      type: "generate",
      params,
      model: model(),
    });
    const doGenerate = vi.fn(async () =>
      AiSdkFactory.generateResult({ text: "new" }),
    );
    expect(
      await middleware.wrapGenerate!({
        doGenerate,
        doStream: vi.fn(),
        params: transformed,
        model: model(),
      }),
    ).toBe(hit);
    expect(doGenerate).not.toHaveBeenCalled();
    expect(transformed.providerOptions).toBeUndefined();
  });

  it("generates and updates the cache on a miss", async () => {
    const cache = new MockCache(null);
    const generated = AiSdkFactory.generateResult({ text: "generated" });
    const doGenerate = vi.fn(async () => generated);

    const result = await runMiddleware(
      cache,
      paramsWithMeta(),
      model(),
      doGenerate,
    );

    expect(result).toBe(generated);
    expect(doGenerate).toHaveBeenCalledOnce();
    expect(cache.updates).toEqual([[cache.requests[0], generated]]);
  });

  it("preserves provider options other than Alumnium metadata", async () => {
    const cache = new MockCache(null);
    const params = paramsWithMeta({ openai: { reasoningEffort: "low" } });

    await runMiddleware(cache, params);

    expect(cache.requests[0]?.params.providerOptions).toEqual({
      openai: { reasoningEffort: "low" },
    });
  });

  it("uses canonical keys and ignores abort signals", async () => {
    const cache = new MockCache(null);
    const middleware = createCacheMiddleware(cache);
    const run = async (params: ReturnType<typeof paramsWithMeta>) => {
      const transformed = await middleware.transformParams!({
        type: "generate",
        params,
        model: model(),
      });
      await middleware.wrapGenerate!({
        doGenerate: async () => AiSdkFactory.generateResult(),
        doStream: vi.fn(),
        params: transformed,
        model: model(),
      });
    };
    await run(
      paramsWithMeta({ openai: { a: 1, b: 2 } }, new AbortController().signal),
    );
    await run(
      paramsWithMeta({ openai: { b: 2, a: 1 } }, new AbortController().signal),
    );
    expect(cache.requests[0]?.key).toBe(cache.requests[1]?.key);
  });

  it("uses different keys for different prompts", async () => {
    const cache = new MockCache(null);
    await runMiddleware(cache, paramsWithMeta());
    await runMiddleware(
      cache,
      paramsWithMeta({}, undefined, undefined, [
        { role: "user", content: [{ type: "text", text: "different" }] },
      ]),
    );

    expect(cache.requests[0]?.key).not.toBe(cache.requests[1]?.key);
  });

  it("uses different keys for different metadata", async () => {
    const cache = new MockCache(null);
    await runMiddleware(cache, paramsWithMeta());
    await runMiddleware(
      cache,
      paramsWithMeta({}, undefined, {
        kind: "locator",
        description: "link",
        treeXml: "<a />",
      }),
    );

    expect(cache.requests[0]?.key).not.toBe(cache.requests[1]?.key);
  });

  it("uses different keys for different provider options", async () => {
    const cache = new MockCache(null);
    await runMiddleware(cache, paramsWithMeta());
    await runMiddleware(
      cache,
      paramsWithMeta({ openai: { reasoningEffort: "high" } }),
    );

    expect(cache.requests[0]?.key).not.toBe(cache.requests[1]?.key);
  });

  it("uses different keys for different models", async () => {
    const cache = new MockCache(null);
    await runMiddleware(cache, paramsWithMeta(), model());
    await runMiddleware(
      cache,
      paramsWithMeta(),
      new MockLanguageModelV4({ provider: "mock", modelId: "other" }),
    );

    expect(cache.requests[0]?.key).not.toBe(cache.requests[1]?.key);
  });

  it("uses different keys for different apps", async () => {
    const first = new MockCache(null);
    const second = new MockCache(null);
    second.updateApp("other-app" as typeof second.app);
    await runMiddleware(first, paramsWithMeta());
    await runMiddleware(second, paramsWithMeta());

    expect(first.requests[0]?.key).not.toBe(second.requests[0]?.key);
  });

  it.each([
    ["missing", undefined],
    ["unknown", { kind: "unknown" }],
  ])("rejects %s cache metadata", async (_case, meta) => {
    const middleware = createCacheMiddleware(new MockCache(null));
    const params = {
      prompt: [],
      ...(meta ? { providerOptions: { alumnium: { meta } } } : {}),
    };

    await expect(
      middleware.transformParams!({ type: "generate", params, model: model() }),
    ).rejects.toThrow("Missing Alumnium cache metadata");
  });
});

function model() {
  return new MockLanguageModelV4({ provider: "mock", modelId: "test" });
}

function paramsWithMeta(
  provider = {},
  abortSignal?: AbortSignal,
  meta = { kind: "locator", description: "button", treeXml: "<button />" },
  prompt: LanguageModelV4CallOptions["prompt"] = [],
): LanguageModelV4CallOptions {
  return {
    prompt,
    ...(abortSignal ? { abortSignal } : {}),
    providerOptions: {
      ...provider,
      alumnium: {
        meta,
      },
    },
  };
}

class MockCache extends ServerCache {
  requests: ServerCache.CacheRequest[] = [];
  updates: Array<
    [ServerCache.CacheRequest, ReturnType<typeof AiSdkFactory.generateResult>]
  > = [];
  readonly result: ReturnType<typeof AiSdkFactory.generateResult> | null;
  constructor(result: ReturnType<typeof AiSdkFactory.generateResult> | null) {
    super(SessionFactory.sessionContext());
    this.result = result;
  }
  override async lookup(request: ServerCache.CacheRequest) {
    this.requests.push(request);
    return this.result;
  }
  override async update(
    request: ServerCache.CacheRequest,
    result: ReturnType<typeof AiSdkFactory.generateResult>,
  ) {
    this.updates.push([request, result]);
  }
  updateApp(app: typeof this.app) {
    this.sessionContext.update({ app });
  }
  async save() {}
  async discard() {}
  async clear() {}
}

async function runMiddleware(
  cache: MockCache,
  params: LanguageModelV4CallOptions,
  languageModel = model(),
  doGenerate = async () => AiSdkFactory.generateResult(),
) {
  const middleware = createCacheMiddleware(cache);
  const transformed = await middleware.transformParams!({
    type: "generate",
    params,
    model: languageModel,
  });
  return middleware.wrapGenerate!({
    doGenerate,
    doStream: vi.fn(),
    params: transformed,
    model: languageModel,
  });
}
