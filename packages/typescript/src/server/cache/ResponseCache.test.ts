import type { LanguageModelV4CallOptions } from "@ai-sdk/provider";
import { describe, expect, it, vi } from "vitest";
import { createMockDir, pushMock } from "../../../tests/unit/mocks.ts";
import { AppId } from "../../AppId.ts";
import { GlobalFileStorePaths } from "../../FileStore/GlobalFileStorePaths.ts";
import { AiSdkFactory } from "../../llm/__factories__/AiSdkFactory.ts";
import { Model } from "../../Model.ts";
import type { RetrieverAgent } from "../agents/RetrieverAgent.ts";
import { SessionContext } from "../session/SessionContext.ts";
import { SessionId } from "../session/SessionId.ts";
import { CacheStore } from "./CacheStore.ts";
import { ResponseCache } from "./ResponseCache.ts";
import type { ServerCache } from "./ServerCache.ts";

describe(ResponseCache, () => {
  it("saves and looks up cached response", async () => {
    const { cache, cacheDir, request1 } = await setup();
    const result = AiSdkFactory.generateResult({ text: "Hi there" });

    await cache.update(request1, result);
    await cache.save();

    const files = await cacheDir.flatTree();
    expect(files).toEqual([
      "test-app/openai/test/responses/first/request.json",
      "test-app/openai/test/responses/first/response.json",
    ]);

    const cached = await cache.lookup(request1);
    expect(cached).toEqual(result);
    expect(cached).not.toBeNull();
  });

  it("supports multiple cache instances saving concurrently", async () => {
    const { sessionContext, cacheStore, cacheDir, request1, request2 } =
      await setup();
    const cache1 = new ResponseCache(sessionContext, cacheStore);
    const cache2 = new ResponseCache(sessionContext, cacheStore);

    const result1 = AiSdkFactory.generateResult({ text: "one" });
    const result2 = AiSdkFactory.generateResult({ text: "two" });
    await cache1.update(request1, result1);
    await cache2.update(request2, result2);
    await cache1.save();
    await cache2.save();

    const files = await cacheDir.flatTree();
    expect(files).toEqual([
      "test-app/openai/test/responses/first/request.json",
      "test-app/openai/test/responses/first/response.json",
      "test-app/openai/test/responses/second/request.json",
      "test-app/openai/test/responses/second/response.json",
    ]);

    expect(await cache1.lookup(request1)).toEqual(result1);
    expect(await cache2.lookup(request2)).toEqual(result2);
  });

  it("keeps entries with different cache keys isolated", async () => {
    const { cache, request1, request2 } = await setup();
    const result = AiSdkFactory.generateResult({ text: "one" });
    await cache.update(request1, result);

    const resultBefore = await cache.lookup(request1);
    expect(resultBefore).toEqual(result);

    const samePromptWithDifferentMeta: ServerCache.CacheRequest = {
      ...request1,
      key: request2.key,
      meta: request2.meta,
    };
    expect(await cache.lookup(samePromptWithDifferentMeta)).toBeNull();
  });

  it("stages, saves, and hydrates complete results", async () => {
    const { cache, cacheStore, request1, sessionContext } = await setup();
    const timestamp = new Date("2026-01-02T03:04:05.000Z");
    const result = {
      ...AiSdkFactory.generateResult({
        text: "Hi",
        usage: {
          inputTokens: { total: 5, cacheRead: 3, cacheWrite: 2 },
          outputTokens: { total: 7, reasoning: 4 },
        },
      }),
      response: { id: "response-id", timestamp },
    };
    await cache.update(request1, result);
    await cache.save();

    const fresh = new ResponseCache(sessionContext, cacheStore);
    const hit = await fresh.lookup(request1);
    expect(hit).toEqual(result);
    expect(hit?.response?.timestamp).toBeInstanceOf(Date);
    expect(fresh.usage).toEqual({
      input_tokens: 5,
      output_tokens: 7,
      total_tokens: 12,
      cache_read: 3,
      cache_creation: 2,
      reasoning: 4,
    });
  });

  it("keeps concurrent staged saves independent", async () => {
    const { cache, cacheStore, request1, request2, sessionContext } =
      await setup();
    const second = new ResponseCache(sessionContext, cacheStore);
    await cache.update(request1, AiSdkFactory.generateResult({ text: "one" }));
    await second.update(request2, AiSdkFactory.generateResult({ text: "two" }));
    await Promise.all([cache.save(), second.save()]);
    expect(await cache.lookup(request1)).not.toBeNull();
    expect(await cache.lookup(request2)).not.toBeNull();
  });
});

async function setup() {
  const sessionContext = new SessionContext({
    app: "test-app" as AppId,
    sessionId: "session" as SessionId,
  });
  const cacheDir = await createMockDir({ prefix: "response-cache" });
  pushMock(
    vi
      .spyOn(GlobalFileStorePaths, "globalSubDir")
      .mockReturnValue(cacheDir.path),
  );
  const cacheStore = new CacheStore(sessionContext, Model.parse("openai/test"));
  const cache = new ResponseCache(sessionContext, cacheStore);
  const params = { prompt: [] } satisfies LanguageModelV4CallOptions;
  const request1: ServerCache.CacheRequest = {
    key: "first" as ServerCache.CacheKey,
    model: { provider: "openai", modelId: "test" },
    params,
    meta: createAgentMeta(),
  };
  const request2: ServerCache.CacheRequest = {
    ...request1,
    key: "second" as ServerCache.CacheKey,
    meta: createAgentMeta("screenshot"),
  };
  return {
    cache,
    cacheStore,
    cacheDir,
    request1,
    request2,
    sessionContext,
  };
}

function createAgentMeta(
  screenshot: string | null = null,
): RetrieverAgent.Meta {
  return {
    kind: "retriever",
    statement: "test information",
    treeXml: "<xml></xml>",
    title: "Test Title",
    url: "https://example.com",
    screenshot,
  };
}
