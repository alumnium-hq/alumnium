import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { describe, expect, it, vi } from "vitest";
import { AppId } from "../../AppId.ts";
import { AiSdkFactory } from "../../llm/__factories__/AiSdkFactory.ts";
import { createLlmUsage, type LlmUsage } from "../../llm/llmSchema.ts";
import { SessionContext } from "../session/SessionContext.ts";
import { SessionId } from "../session/SessionId.ts";
import { ChainedCache } from "./ChainedCache.ts";
import { ServerCache } from "./ServerCache.ts";

describe(ChainedCache, () => {
  describe("constructor", () => {
    it("initializes correctly", () => {
      const { sessionContext, cache1, cache2 } = setup();

      const chained = new ChainedCache(sessionContext, [cache1, cache2]);

      expect(chained.caches.length).toBe(2);
      expect(chained.caches[0]).toBe(cache1);
      expect(chained.caches[1]).toBe(cache2);
      expect(chained.usage).toEqual(createLlmUsage());
    });

    it("allows passing no caches", async () => {
      const { sessionContext } = setup();
      const chained = new ChainedCache(sessionContext, []);
      expect(chained.caches.length).toBe(0);
    });
  });

  describe("lookup", () => {
    it("returns first cache hit", async () => {
      const { sessionContext, cache1, cache2, request } = setup();
      const response = createResult();
      cache1.assign(response);
      cache2.assign(null);

      const chained = new ChainedCache(sessionContext, [cache1, cache2]);
      const result = await chained.lookup(request);

      expect(result).toBe(response);
      expect(cache1.lookup).toHaveBeenCalledTimes(1);
      expect(cache2.lookup).toHaveBeenCalledTimes(0);
    });

    it("falls through to second cache", async () => {
      const { sessionContext, cache1, cache2, request } = setup();
      const response = createResult();
      cache1.assign(null);
      cache2.assign(response);

      const chained = new ChainedCache(sessionContext, [cache1, cache2]);
      const result = await chained.lookup(request);

      expect(result).toBe(response);
      expect(cache1.lookup).toHaveBeenCalledTimes(1);
      expect(cache2.lookup).toHaveBeenCalledTimes(1);
    });

    it("returns null when all caches miss", async () => {
      const { sessionContext, cache1, cache2, cache3, request } = setup();

      const chained = new ChainedCache(sessionContext, [
        cache1,
        cache2,
        cache3,
      ]);
      const result = await chained.lookup(request);

      expect(result).toBeNull();
      expect(cache1.lookup).toHaveBeenCalledTimes(1);
      expect(cache2.lookup).toHaveBeenCalledTimes(1);
      expect(cache3.lookup).toHaveBeenCalledTimes(1);
    });

    it("stops at first hit", async () => {
      const { sessionContext, cache1, cache2, cache3, request } = setup();
      cache2.assign(createResult());

      const chained = new ChainedCache(sessionContext, [
        cache1,
        cache2,
        cache3,
      ]);
      await chained.lookup(request);

      expect(cache1.lookup).toHaveBeenCalledTimes(1);
      expect(cache2.lookup).toHaveBeenCalledTimes(1);
      expect(cache3.lookup).toHaveBeenCalledTimes(0);
    });
  });

  describe("update", () => {
    it("updates all caches", async () => {
      const { sessionContext, cache1, cache2, cache3, request } = setup();
      const response = createResult();

      const chained = new ChainedCache(sessionContext, [
        cache1,
        cache2,
        cache3,
      ]);
      await chained.update(request, response);

      expect(cache1.update).toHaveBeenCalledTimes(1);
      expect(cache1.update).toHaveBeenCalledWith(request, response);
      expect(cache2.update).toHaveBeenCalledTimes(1);
      expect(cache2.update).toHaveBeenCalledWith(request, response);
      expect(cache3.update).toHaveBeenCalledTimes(1);
      expect(cache3.update).toHaveBeenCalledWith(request, response);
    });

    it("does not fail with no caches", async () => {
      const { sessionContext, request } = setup();
      const chained = new ChainedCache(sessionContext, []);
      await chained.update(request, createResult());
    });
  });

  describe("save", () => {
    it("saves all caches", async () => {
      const { sessionContext, cache1, cache2 } = setup();
      const chained = new ChainedCache(sessionContext, [cache1, cache2]);

      await chained.save();

      expect(cache1.save).toHaveBeenCalledTimes(1);
      expect(cache2.save).toHaveBeenCalledTimes(1);
    });
  });

  describe("discard", () => {
    it("discards all caches", async () => {
      const { sessionContext, cache1, cache2 } = setup();
      const chained = new ChainedCache(sessionContext, [cache1, cache2]);

      await chained.discard();

      expect(cache1.discard).toHaveBeenCalledTimes(1);
      expect(cache2.discard).toHaveBeenCalledTimes(1);
    });
  });

  describe("clear", () => {
    it("clears all caches with args", async () => {
      const { sessionContext, cache1, cache2 } = setup();
      const chained = new ChainedCache(sessionContext, [cache1, cache2]);

      await chained.clear({ reason: "test" });

      expect(cache1.clear).toHaveBeenCalledTimes(1);
      expect(cache2.clear).toHaveBeenCalledTimes(1);
    });

    it("passes clear props to all caches", async () => {
      const { sessionContext, cache1, cache2 } = setup();
      const chained = new ChainedCache(sessionContext, [cache1, cache2]);

      const clearProps = { reason: "test", timestamp: Date.now() };
      await chained.clear(clearProps);

      expect(cache1.clear).toHaveBeenCalledWith(clearProps);
      expect(cache2.clear).toHaveBeenCalledWith(clearProps);
    });
  });

  describe("usage", () => {
    it("resolves usage from first hit cache", async () => {
      const { sessionContext, cache1, cache2, request } = setup();
      const response = createResult();
      cache2.assign(response, usage());

      const chained = new ChainedCache(sessionContext, [cache1, cache2]);
      await chained.lookup(request);

      expect(chained.usage).toEqual(usage());
    });

    it("resolves usage from last cache hit", async () => {
      const { sessionContext, cache1, cache2, request } = setup();
      const response = createResult();
      cache1.assign(null, {
        ...createLlmUsage(),
        input_tokens: 1,
        output_tokens: 1,
        total_tokens: 1,
        cache_creation: 1,
        cache_read: 1,
        reasoning: 1,
      });
      cache2.assign(response, usage());

      const chained = new ChainedCache(sessionContext, [cache1, cache2]);
      await chained.lookup(request);

      expect(chained.usage).toEqual(usage());
    });

    it("resolves empty usage on miss", async () => {
      const { sessionContext, cache1, cache2, request } = setup();
      cache1.assign(null, {
        ...createLlmUsage(),
        input_tokens: 1,
        output_tokens: 1,
        total_tokens: 1,
      });
      cache2.assign(null, {
        ...createLlmUsage(),
        input_tokens: 2,
        output_tokens: 2,
        total_tokens: 2,
      });

      const chained = new ChainedCache(sessionContext, [cache1, cache2]);
      await chained.lookup(request);

      expect(chained.usage).toEqual(createLlmUsage());
    });
  });

  it("returns the first hit and updates every layer", async () => {
    const { sessionContext, request } = setup();
    const first = new MockCache(sessionContext, null);
    const hit = AiSdkFactory.generateResult({ text: "hit" });
    const second = new MockCache(sessionContext, hit);
    const third = new MockCache(
      sessionContext,
      AiSdkFactory.generateResult({ text: "late" }),
    );
    second.usage.input_tokens = 4;
    const chained = new ChainedCache(sessionContext, [first, second, third]);
    expect(await chained.lookup(request)).toBe(hit);
    expect(third.lookup).not.toHaveBeenCalled();
    expect(chained.usage.input_tokens).toBe(4);

    await chained.update(request, hit);
    expect(first.update).toHaveBeenCalledWith(request, hit);
    expect(second.update).toHaveBeenCalledWith(request, hit);
    expect(third.update).toHaveBeenCalledWith(request, hit);
  });
});

function setup() {
  const sessionContext = new SessionContext({
    app: "test-app" as AppId,
    sessionId: "test-session-id" as SessionId,
  });
  const cache1 = new MockCache(sessionContext);
  const cache2 = new MockCache(sessionContext);
  const cache3 = new MockCache(sessionContext);
  const request: ServerCache.CacheRequest = {
    key: "key" as ServerCache.CacheKey,
    model: { provider: "mock", modelId: "model" },
    params: { prompt: [] },
    meta: { kind: "locator", description: "test", treeXml: "<xml />" },
  };
  return { sessionContext, cache1, cache2, cache3, request };
}

function createResult(): LanguageModelV4GenerateResult {
  return AiSdkFactory.generateResult({ text: "Hi there" });
}

function usage(): LlmUsage {
  return {
    input_tokens: 1,
    output_tokens: 2,
    total_tokens: 3,
    cache_creation: 4,
    cache_read: 5,
    reasoning: 6,
  };
}

class MockCache extends ServerCache {
  result: LanguageModelV4GenerateResult | null;

  constructor(
    context: SessionContext,
    result: LanguageModelV4GenerateResult | null = null,
  ) {
    super(context);
    this.result = result;
  }

  assign(result: LanguageModelV4GenerateResult | null, usage?: LlmUsage) {
    this.result = result;
    if (usage) this.usage = usage;
  }

  override lookup = vi.fn(async () => this.result);
  override update = vi.fn(async () => {});
  save = vi.fn(async () => {});
  discard = vi.fn(async () => {});
  clear = vi.fn(async () => {});
}
