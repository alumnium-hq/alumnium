import type { Generation } from "@langchain/core/outputs";
import { describe, expect, it, vi } from "vitest";
import { AppId } from "../../AppId.ts";
import { Lchain } from "../../llm/Lchain.ts";
import { createLlmUsage, LlmUsage } from "../../llm/llmSchema.ts";
import { LlmContext } from "../LlmContext.ts";
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
      const { sessionContext, cache1, cache2, lookupArgs } = setup();
      const response = createGenerations();
      cache1.assign(response);
      cache2.assign(null);

      const chained = new ChainedCache(sessionContext, [cache1, cache2]);
      const result = await chained.lookup(...lookupArgs);

      expect(result).toBe(response);
      expect(cache1.lookup).toBeCalledTimes(1);
      expect(cache2.lookup).toBeCalledTimes(0);
    });

    it("falls through to second cache", async () => {
      const { sessionContext, cache1, cache2, lookupArgs } = setup();
      const response = createGenerations();
      cache1.assign(null);
      cache2.assign(response);

      const chained = new ChainedCache(sessionContext, [cache1, cache2]);
      const result = await chained.lookup(...lookupArgs);

      expect(result).toBe(response);
      expect(cache1.lookup).toBeCalledTimes(1);
      expect(cache2.lookup).toBeCalledTimes(1);
    });

    it("returns null when all caches miss", async () => {
      const { sessionContext, cache1, cache2, cache3, lookupArgs } = setup();

      const chained = new ChainedCache(sessionContext, [
        cache1,
        cache2,
        cache3,
      ]);
      const result = await chained.lookup(...lookupArgs);

      expect(result).toBeNull();
      expect(cache1.lookup).toBeCalledTimes(1);
      expect(cache2.lookup).toBeCalledTimes(1);
      expect(cache3.lookup).toBeCalledTimes(1);
    });

    it("stops at first hit", async () => {
      const { sessionContext, cache1, cache2, cache3, lookupArgs } = setup();
      cache2.assign(createGenerations());

      const chained = new ChainedCache(sessionContext, [
        cache1,
        cache2,
        cache3,
      ]);
      await chained.lookup(...lookupArgs);

      expect(cache1.lookup).toBeCalledTimes(1);
      expect(cache2.lookup).toBeCalledTimes(1);
      expect(cache3.lookup).toBeCalledTimes(0);
    });
  });

  describe("update", () => {
    it("updates all caches", async () => {
      const { sessionContext, cache1, cache2, cache3, lookupArgs } = setup();
      const response = createGenerations();

      const chained = new ChainedCache(sessionContext, [
        cache1,
        cache2,
        cache3,
      ]);
      await chained.update(...lookupArgs, response);

      expect(cache1.update).toBeCalledTimes(1);
      expect(cache1.update).toBeCalledWith("prompt", "llm", response);
      expect(cache2.update).toBeCalledTimes(1);
      expect(cache2.update).toBeCalledWith("prompt", "llm", response);
      expect(cache3.update).toBeCalledTimes(1);
      expect(cache3.update).toBeCalledWith("prompt", "llm", response);
    });

    it("does not fail with no caches", async () => {
      const { sessionContext, lookupArgs } = setup();
      const chained = new ChainedCache(sessionContext, []);
      await chained.update(...lookupArgs, createGenerations());
    });
  });

  describe("save", () => {
    it("saves all caches", async () => {
      const { sessionContext, cache1, cache2 } = setup();
      const chained = new ChainedCache(sessionContext, [cache1, cache2]);

      await chained.save();

      expect(cache1.save).toBeCalledTimes(1);
      expect(cache2.save).toBeCalledTimes(1);
    });
  });

  describe("discard", () => {
    it("discards all caches", async () => {
      const { sessionContext, cache1, cache2 } = setup();
      const chained = new ChainedCache(sessionContext, [cache1, cache2]);

      await chained.discard();

      expect(cache1.discard).toBeCalledTimes(1);
      expect(cache2.discard).toBeCalledTimes(1);
    });
  });

  describe("clear", () => {
    it("clears all caches with args", async () => {
      const { sessionContext, cache1, cache2 } = setup();
      const chained = new ChainedCache(sessionContext, [cache1, cache2]);

      await chained.clear({ reason: "test" });

      expect(cache1.clear).toBeCalledTimes(1);
      expect(cache2.clear).toBeCalledTimes(1);
    });

    it("passes clear props to all caches", async () => {
      const { sessionContext, cache1, cache2 } = setup();
      const chained = new ChainedCache(sessionContext, [cache1, cache2]);

      const clearProps = { reason: "test", timestamp: Date.now() };
      await chained.clear(clearProps);

      expect(cache1.clear).toBeCalledWith(clearProps);
      expect(cache2.clear).toBeCalledWith(clearProps);
    });
  });

  describe("usage", () => {
    it("resolves usage from first hit cache", async () => {
      const { sessionContext, cache1, cache2, lookupArgs } = setup();
      const response = createGenerations();
      cache2.assign(response, {
        ...createLlmUsage(),
        input_tokens: 1,
        output_tokens: 2,
        total_tokens: 3,
        cache_creation: 4,
        cache_read: 5,
        reasoning: 6,
      });

      const chained = new ChainedCache(sessionContext, [cache1, cache2]);
      await chained.lookup(...lookupArgs);

      expect(chained.usage).toEqual({
        input_tokens: 1,
        output_tokens: 2,
        total_tokens: 3,
        cache_creation: 4,
        cache_read: 5,
        reasoning: 6,
      });
    });

    it("resolves usage from last cache hit", async () => {
      const { sessionContext, cache1, cache2, lookupArgs } = setup();
      const response = createGenerations();
      cache1.assign(null, {
        ...createLlmUsage(),
        input_tokens: 1,
        output_tokens: 1,
        total_tokens: 1,
        cache_creation: 1,
        cache_read: 1,
        reasoning: 1,
      });
      cache2.assign(response, {
        ...createLlmUsage(),
        input_tokens: 1,
        output_tokens: 2,
        total_tokens: 3,
        cache_creation: 4,
        cache_read: 5,
        reasoning: 6,
      });

      const chained = new ChainedCache(sessionContext, [cache1, cache2]);
      await chained.lookup(...lookupArgs);

      expect(chained.usage).toEqual({
        input_tokens: 1,
        output_tokens: 2,
        total_tokens: 3,
        cache_creation: 4,
        cache_read: 5,
        reasoning: 6,
      });
    });

    it("resolves empty usage on miss", async () => {
      const { sessionContext, cache1, cache2, lookupArgs } = setup();
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
      await chained.lookup(...lookupArgs);

      expect(chained.usage).toEqual({
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        cache_creation: 0,
        cache_read: 0,
        reasoning: 0,
      });
    });
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
  const lookupArgs = [
    "prompt" as LlmContext.Prompt,
    "llm" as LlmContext.LlmKey,
  ] as const;
  return { sessionContext, cache1, cache2, cache3, lookupArgs };
}

function createGenerations(): Generation[] {
  return [
    Lchain.fromStored({
      text: "Hi there",
      message: {
        type: "ai",
        data: {
          content: "Hi there",
          response_metadata: {
            usage: {
              input_tokens: 1,
              output_tokens: 2,
              total_tokens: 3,
            },
          },
          additional_kwargs: {},
          tool_calls: [],
          invalid_tool_calls: [],
          usage_metadata: {
            input_tokens: 1,
            output_tokens: 2,
            total_tokens: 3,
          },
          id: "gen-id",
        },
      },
    }),
  ];
}

class MockCache extends ServerCache {
  caches: ServerCache[] = [];
  result: Generation[] | null = null;

  assign(result: any, usage?: LlmUsage) {
    this.result = result;
    if (usage) this.usage = usage;
  }

  override lookup = vi.fn(async () => this.result);
  override update = vi.fn(async () => {});
  save = vi.fn(async () => {});
  discard = vi.fn(async () => {});
  clear = vi.fn(async () => {});
}
