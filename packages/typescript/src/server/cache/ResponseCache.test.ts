import type { Generation } from "@langchain/core/outputs";
import { describe, expect, it, vi } from "vitest";
import { createMockDir, pushMock } from "../../../tests/unit/mocks.ts";
import { AppId } from "../../AppId.ts";
import { GlobalFileStorePaths } from "../../FileStore/GlobalFileStorePaths.ts";
import { Lchain } from "../../llm/Lchain.ts";
import { Model } from "../../Model.ts";
import type { RetrieverAgent } from "../agents/RetrieverAgent.ts";
import { LlmContext } from "../LlmContext.ts";
import { SessionContext } from "../session/SessionContext.ts";
import { SessionId } from "../session/SessionId.ts";
import { CacheStore } from "./CacheStore.ts";
import { ResponseCache } from "./ResponseCache.ts";

describe("ResponseCache", () => {
  it("saves and looks up cached response", async () => {
    const {
      sessionContext,
      llmContext,
      cacheStore,
      cacheDir,
      prompt1,
      llmKey,
    } = await setup();
    const cache = new ResponseCache(sessionContext, cacheStore, llmContext);

    const generations = createGenerations("Hi there");
    await cache.update(prompt1, llmKey, generations);
    await cache.save();

    const model = Model.current.toString();
    const baseDir = `test-app/${model}/responses`;
    const files = await cacheDir.flatTree();
    expect(files).toMatchInlineSnapshot(
      [
        `${baseDir}/d2e93e97ce7079be/request.json`,
        `${baseDir}/d2e93e97ce7079be/response.json`,
      ],
      `
      [
        "test-app/openai/gpt-5-nano-2025-08-07/responses/d2e93e97ce7079be/request.json",
        "test-app/openai/gpt-5-nano-2025-08-07/responses/d2e93e97ce7079be/response.json",
      ]
    `,
    );

    const result = await cache.lookup(prompt1, llmKey);
    expect(result).toEqual(generations);
    expect(result).not.toBeNull();
  });

  it("supports multiple cache instances saving concurrently", async () => {
    const {
      sessionContext,
      llmContext,
      cacheStore,
      cacheDir,
      prompt1,
      prompt2,
      llmKey,
    } = await setup();
    const cache1 = new ResponseCache(sessionContext, cacheStore, llmContext);
    const cache2 = new ResponseCache(sessionContext, cacheStore, llmContext);

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
      `${baseDir}/a07a64efcdf52cdc/request.json`,
      `${baseDir}/a07a64efcdf52cdc/response.json`,
      `${baseDir}/d2e93e97ce7079be/request.json`,
      `${baseDir}/d2e93e97ce7079be/response.json`,
    ]);

    const result1 = await cache1.lookup(prompt1, llmKey);
    expect(result1).toEqual(generations1);
    const result2 = await cache2.lookup(prompt2, llmKey);
    expect(result2).toEqual(generations2);
  });

  it("differentiates same prompts with different metadata", async () => {
    const { sessionContext, llmContext, cacheStore, prompt1, llmKey } =
      await setup();
    const cache = new ResponseCache(sessionContext, cacheStore, llmContext);

    const generations = createGenerations("one");
    await cache.update(prompt1, llmKey, generations);

    const resultBefore = await cache.lookup(prompt1, llmKey);
    expect(resultBefore).toEqual(generations);

    llmContext.clearPromptsMeta([prompt1]);
    const newMeta = createAgentMeta("screenshot");
    llmContext.assignPromptsMeta([prompt1], newMeta);

    const result = await cache.lookup(prompt1, llmKey);
    expect(result).toBeNull();
  });
});

async function setup() {
  const sessionContext = new SessionContext({
    app: "test-app" as AppId,
    sessionId: "test-session-id" as SessionId,
  });

  const llmContext = new LlmContext();

  const cacheDir = await createMockDir({ prefix: "response-cache" });

  const fixedModel = new Model("openai", "gpt-5-nano-2025-08-07");
  pushMock(
    vi.spyOn(Model, "current", "get").mockReturnValue(fixedModel),
    vi
      .spyOn(GlobalFileStorePaths, "globalSubDir")
      .mockReturnValue(cacheDir.path),
  );
  const cacheStore = new CacheStore(sessionContext, Model.current);

  const prompt1 = "prompt 1" as LlmContext.Prompt;
  const prompt2 = "prompt 2" as LlmContext.Prompt;
  const llmKey = "test-llm" as LlmContext.LlmKey;

  const meta1 = createAgentMeta();
  llmContext.assignPromptsMeta([prompt1], meta1);

  const meta2 = createAgentMeta("screenshot");
  llmContext.assignPromptsMeta([prompt2], meta2);

  return {
    sessionContext,
    llmContext,
    cacheStore,
    cacheDir,
    prompt1,
    prompt2,
    meta1,
    meta2,
    llmKey,
  };
}

function createGenerations(text: string): Generation[] {
  return [
    Lchain.fromStored({
      text,
      message: {
        type: "ai",
        data: {
          id: "gen-id",
          content: text,
          tool_calls: [],
          invalid_tool_calls: [],
          usage_metadata: {
            input_tokens: 1,
            output_tokens: 2,
            total_tokens: 3,
          },
          response_metadata: {},
          additional_kwargs: {},
        },
      },
    }),
  ];
}

function createAgentMeta(
  screenshot: string | null = null,
): RetrieverAgent.Meta {
  return {
    kind: "retriever",
    information: "test information",
    treeXml: "<xml></xml>",
    title: "Test Title",
    url: "https://example.com",
    screenshot,
  };
}
