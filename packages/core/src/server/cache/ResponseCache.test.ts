import { deserializeStoredGeneration } from "@langchain/core/caches";
import type { Generation } from "@langchain/core/outputs";
import { describe, expect, it, spyOn } from "bun:test";
import { createMockDir, pushMock } from "../../../tests/mocks.js";
import { AppId } from "../../AppId.js";
import { FsStore } from "../../FsStore.js";
import { Model } from "../../Model.js";
import { LlmContext } from "../LlmContext.js";
import { SessionContext } from "../session/SessionContext.js";
import { SessionId } from "../session/SessionId.js";
import { CacheStore } from "./CacheStore.js";
import { ResponseCache } from "./ResponseCache.js";

describe("ResponseCache", () => {
  it("saves and looks up cached response", async () => {
    const { sessionContext, cacheStore, cacheDir, prompt1, llmKey } =
      await setup();
    const cache = new ResponseCache(sessionContext, cacheStore);

    const generations = createGenerations("Hi there");
    await cache.update(prompt1, llmKey, generations);
    await cache.save();

    const model = Model.current.toString();
    const baseDir = `test-app/${model}/responses`;
    const files = await cacheDir.flatTree();
    expect(files).toEqual([
      `${baseDir}/61c658835389ffe6/request.json`,
      `${baseDir}/61c658835389ffe6/response.json`,
    ]);

    const result = await cache.lookup(prompt1, llmKey);
    expect(result).toEqual(generations);
    expect(result).not.toBeNull();
  });

  it("supports multiple cache instances saving concurrently", async () => {
    const { sessionContext, cacheStore, cacheDir, prompt1, prompt2, llmKey } =
      await setup();
    const cache1 = new ResponseCache(sessionContext, cacheStore);
    const cache2 = new ResponseCache(sessionContext, cacheStore);

    const generations1 = createGenerations("one");
    const generations2 = createGenerations("two");
    await cache1.update(prompt1, llmKey, generations1);
    await cache2.update(prompt2, llmKey, generations2);
    await cache1.save();
    await cache2.save();

    const model = Model.current.toString();
    const baseDir = `test-app/${model}/responses`;
    const files = await cacheDir.flatTree();
    expect(files).toEqual([
      `${baseDir}/61c658835389ffe6/request.json`,
      `${baseDir}/61c658835389ffe6/response.json`,
      `${baseDir}/c6c488a888c8e4df/request.json`,
      `${baseDir}/c6c488a888c8e4df/response.json`,
    ]);

    const result1 = await cache1.lookup(prompt1, llmKey);
    expect(result1).toEqual(generations1);
    const result2 = await cache2.lookup(prompt2, llmKey);
    expect(result2).toEqual(generations2);
  });
});

async function setup() {
  const sessionContext = new SessionContext({
    app: "test-app" as AppId,
    sessionId: "test-session-id" as SessionId,
  });

  const cacheDir = await createMockDir({ prefix: "response-cache" });

  pushMock(spyOn(FsStore, "globalSubDir").mockReturnValue(cacheDir.path));
  const cacheStore = new CacheStore(sessionContext);

  const prompt1 = "prompt 1" as LlmContext.Prompt;
  const prompt2 = "prompt 2" as LlmContext.Prompt;
  const llmKey = "test-llm" as LlmContext.LlmKey;

  return { sessionContext, cacheStore, cacheDir, prompt1, prompt2, llmKey };
}

function createGenerations(text: string): Generation[] {
  return [
    deserializeStoredGeneration({
      text,
      message: {
        type: "system",
        data: {
          content: text,
          role: "assistant",
          tool_call_id: undefined,
          name: undefined,
        },
      },
    }),
  ];
}
