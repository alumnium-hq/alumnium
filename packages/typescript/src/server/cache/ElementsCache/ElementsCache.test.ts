import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import fs from "node:fs/promises";
import { generateText, tool, wrapLanguageModel } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import z from "zod";
import { createMockDir, pushMock } from "../../../../tests/unit/mocks.ts";
import { AppId } from "../../../AppId.ts";
import { GlobalFileStorePaths } from "../../../FileStore/GlobalFileStorePaths.ts";
import { AiSdk } from "../../../llm/AiSdk.ts";
import { AiSdkFactory } from "../../../llm/__factories__/AiSdkFactory.ts";
import { Model } from "../../../Model.ts";
import type { BaseAgent } from "../../agents/BaseAgent.ts";
import { SessionContext } from "../../session/SessionContext.ts";
import { SessionId } from "../../session/SessionId.ts";
import { createCacheMiddleware } from "../CacheMiddleware.ts";
import { CacheStore } from "../CacheStore.ts";
import type { ServerCache } from "../ServerCache.ts";
import { ElementsCache } from "./ElementsCache.ts";

describe(ElementsCache, () => {
  describe("lookup", () => {
    it("resolves null for requests without element metadata", async () => {
      const { cache } = await setup();

      expect(
        await cache.lookup(unsupportedRequest("changes-analyzer")),
      ).toBeNull();
    });

    it("resolves null for unsupported agent requests", async () => {
      const { cache } = await setup();

      expect(await cache.lookup(unsupportedRequest("locator"))).toBeNull();
    });

    it("resolves cached planner response for exact match", async () => {
      const { cache } = await setup();
      const request = plannerRequest('<button id="1" name="Login" />');
      const result = AiSdkFactory.generateResult({ text: "step1" });

      await cache.update(request, result);
      await cache.save();

      expect(await cache.lookup(request)).toEqual(result);
    });

    it("resolves null for planner response if app does not match", async () => {
      const { cache, context } = await setup();
      const request = plannerRequest('<button id="1" name="Login" />');

      await cache.update(
        request,
        AiSdkFactory.generateResult({ text: "step1" }),
      );
      await cache.save();
      context.update({ app: "different-app" as AppId });

      expect(await cache.lookup(request)).toBeNull();
    });

    it("ignores malformed accessibility tree for planner response", async () => {
      const { cache } = await setup();
      const request = plannerRequest('<button id="1');
      const result = AiSdkFactory.generateResult({ text: "step1" });

      await cache.update(request, result);
      await cache.save();

      expect(await cache.lookup(request)).toEqual(result);
    });

    it("resolves cached actor response for exact match", async () => {
      const { cache } = await setup();
      const request = actorRequest('<button id="1" name="Login" />');
      const result = actorResult(1, "step1");

      await cache.update(request, result);
      await cache.save();

      expect(await cache.lookup(request)).toEqual(result);
    });

    it("resolves null for actor response if app does not match", async () => {
      const { cache, context } = await setup();
      const request = actorRequest('<button id="1" name="Login" />');

      await cache.update(request, actorResult(1, "step1"));
      await cache.save();
      context.update({ app: "different-app" as AppId });

      expect(await cache.lookup(request)).toBeNull();
    });

    it("resolves actor ids in similar trees with changed ids", async () => {
      const { cache } = await setup();
      const original = actorRequest('<button id="1" name="Login" />');
      const changed = actorRequest(
        '<div><button id="99" name="Login" /></div>',
      );

      await cache.update(original, actorResult(1));
      await cache.save();

      const originalHit = await cache.lookup(original);
      expect(toolCallInputs(originalHit!)).toEqual([{ id: 1 }]);

      const changedHit = await cache.lookup(changed);
      expect(toolCallInputs(changedHit!)).toEqual([{ id: 99 }]);
    });

    it("resolves null when cached elements cannot be resolved", async () => {
      const { cache } = await setup();

      await cache.update(
        actorRequest('<button id="1" name="Login" />'),
        actorResult(1),
      );
      await cache.save();

      expect(
        await cache.lookup(actorRequest('<button id="9" name="Logout" />')),
      ).toBeNull();
    });

    it("returns null for malformed actor accessibility tree", async () => {
      const { cache } = await setup();
      const request = actorRequest('<button id="1');

      await cache.update(request, actorResult(1));
      await cache.save();

      expect(await cache.lookup(request)).toBeNull();
    });

    it("treats a malformed cached tool input as a miss", async () => {
      const { cache, cacheDir } = await setup();
      const request = actorRequest('<button id="1" name="Login" />');
      await cache.update(request, actorResult(1));
      await cache.save();

      const malformed = AiSdkFactory.generateResult({
        toolCalls: [
          AiSdkFactory.toolCall({ args: { id: "<MASKED_0>" } }),
          AiSdkFactory.toolCall({ input: "{" }),
        ],
      });
      const responsePath =
        "test-app/openai/test/elements/actor/e1431b0101011f06/response.json";
      await fs.writeFile(
        `${cacheDir.path}/${responsePath}`,
        JSON.stringify(malformed),
      );

      expect(await cache.lookup(request)).toBeNull();
    });

    it("replays remapped tool input through generateText", async () => {
      const { cache } = await setup();
      const baseModel = new MockLanguageModelV4({
        provider: "openai",
        modelId: "test",
        doGenerate: actorResult(1),
      });
      const model = wrapLanguageModel({
        model: baseModel,
        middleware: createCacheMiddleware(cache),
      });
      const tools = {
        ClickTool: tool({
          inputSchema: z.object({ id: z.number() }),
          execute: async () => "clicked",
        }),
      };
      const run = (treeXml: string) =>
        generateText({
          model,
          prompt: "click login",
          tools,
          providerOptions: {
            alumnium: { meta: actorRequest(treeXml).meta },
          },
        });

      expect((await run('<button id="1" name="Login" />')).toolCalls).toEqual([
        expect.objectContaining({ input: { id: 1 }, toolName: "ClickTool" }),
      ]);
      expect(
        (await run('<div><button id="99" name="Login" /></div>')).toolCalls,
      ).toEqual([
        expect.objectContaining({ input: { id: 99 }, toolName: "ClickTool" }),
      ]);
      expect(baseModel.doGenerateCalls).toHaveLength(1);
    });
  });

  describe("update", () => {
    it("uses updated app context for path names", async () => {
      const { cache, cacheDir, context } = await setup();
      const app = "staging.airbnb.com" as AppId;
      context.update({ app });

      await cache.update(
        plannerRequest('<button id="1" name="Login" />'),
        AiSdkFactory.generateResult({ text: "step1" }),
      );
      await cache.save();

      const baseDir = `${app}/openai/test/elements/planner/fda0aa9253105607`;
      expect(await cacheDir.flatTree()).toEqual([
        `${baseDir}/elements.json`,
        `${baseDir}/instruction.json`,
        `${baseDir}/response.json`,
      ]);
    });

    it("stores planner instruction, response, and empty elements", async () => {
      const { cache, cacheDir } = await setup();
      const result = AiSdkFactory.generateResult({ text: "step1\nstep2" });

      await cache.update(
        plannerRequest('<button id="1">Login</button>', "login to app"),
        result,
      );
      await cache.save();

      const baseDir = "test-app/openai/test/elements/planner/dabae3acdc54c74d";
      const responsePath = `${baseDir}/response.json`;
      const instructionPath = `${baseDir}/instruction.json`;
      const elementsPath = `${baseDir}/elements.json`;
      expect(await cacheDir.flatTree()).toEqual([
        elementsPath,
        instructionPath,
        responsePath,
      ]);
      expect(await cacheDir.readJson(responsePath)).toEqual(result);
      expect(await cacheDir.readJson(instructionPath)).toEqual({
        goal: "login to app",
      });
      expect(await cacheDir.readJson(elementsPath)).toEqual([]);
    });

    it("stores actor instruction, masked response, and elements", async () => {
      const { cache, cacheDir } = await setup();
      const text = "step1\nstep2";

      await cache.update(
        actorRequest('<button id="1" name="Login" />'),
        actorResult(1, text),
      );
      await cache.save();

      const baseDir = "test-app/openai/test/elements/actor/e1431b0101011f06";
      const responsePath = `${baseDir}/response.json`;
      const instructionPath = `${baseDir}/instruction.json`;
      const elementsPath = `${baseDir}/elements.json`;
      expect(await cacheDir.flatTree()).toEqual([
        elementsPath,
        instructionPath,
        responsePath,
      ]);
      expect(await cacheDir.readJson(responsePath)).toEqual(
        actorResult("<MASKED_0>", text),
      );
      expect(await cacheDir.readJson(instructionPath)).toEqual({
        step: 'Click "Login" button',
        goal: "login",
      });
      expect(await cacheDir.readJson(elementsPath)).toEqual([
        {
          role: "button",
          index: 0,
          name: "Login",
        },
      ]);
    });
  });

  describe("discard", () => {
    it("discards memory cache", async () => {
      const { cache, cacheDir } = await setup();

      await cache.update(
        plannerRequest('<button id="1" name="Login" />'),
        AiSdkFactory.generateResult({ text: "step1" }),
      );
      await cache.discard();
      await cache.save();

      expect(await cacheDir.flatTree()).toEqual([]);
    });
  });

  describe("clear", () => {
    it("removes all cached files", async () => {
      const { cache, cacheDir } = await setup();

      await cache.update(
        plannerRequest('<button id="1" name="Login" />'),
        AiSdkFactory.generateResult({ text: "step1" }),
      );
      await cache.save();
      expect(await cacheDir.flatTree()).toHaveLength(3);

      await cache.clear();

      expect(await cacheDir.flatTree()).toEqual([]);
    });
  });

  describe("usage", () => {
    it("tracks usage when lookup hits", async () => {
      const { cache } = await setup();
      const request = plannerRequest('<button id="1" name="Login" />');
      expect(cache.usage).toEqual({
        cache_creation: 0,
        cache_read: 0,
        input_tokens: 0,
        output_tokens: 0,
        reasoning: 0,
        total_tokens: 0,
      });

      await cache.update(
        request,
        AiSdkFactory.generateResult({
          text: "step1",
          usage: {
            inputTokens: { total: 5, cacheRead: 25, cacheWrite: 20 },
            outputTokens: { total: 10, reasoning: 30 },
          },
        }),
      );
      await cache.save();

      await cache.lookup(request);
      expect(cache.usage).toEqual({
        input_tokens: 5,
        output_tokens: 10,
        total_tokens: 15,
        cache_creation: 20,
        cache_read: 25,
        reasoning: 30,
      });

      await cache.lookup(request);
      expect(cache.usage).toEqual({
        input_tokens: 10,
        output_tokens: 20,
        total_tokens: 30,
        cache_creation: 40,
        cache_read: 50,
        reasoning: 60,
      });
    });
  });
});

async function setup() {
  const cacheDir = await createMockDir({ prefix: "elements-cache" });
  pushMock(
    vi
      .spyOn(GlobalFileStorePaths, "globalSubDir")
      .mockReturnValue(cacheDir.path),
  );
  const context = new SessionContext({
    app: "test-app" as AppId,
    sessionId: "test-session-id" as SessionId,
  });
  const cacheStore = new CacheStore(context, Model.parse("openai/test"));
  return {
    cache: new ElementsCache(context, cacheStore),
    cacheDir,
    context,
  };
}

function plannerRequest(
  treeXml: string,
  goal = "click login",
): ServerCache.CacheRequest {
  return request({
    kind: "planner",
    goal: goal as BaseAgent.Goal,
    treeXml,
  });
}

function actorRequest(treeXml: string): ServerCache.CacheRequest {
  return request({
    kind: "actor",
    goal: "login" as BaseAgent.Goal,
    step: 'Click "Login" button' as BaseAgent.Step,
    treeXml,
  });
}

function unsupportedRequest(
  kind: "changes-analyzer" | "locator",
): ServerCache.CacheRequest {
  return kind === "changes-analyzer"
    ? request({ kind })
    : request({ kind, description: "test", treeXml: "<div />" });
}

function request(
  meta: ServerCache.CacheRequest["meta"],
): ServerCache.CacheRequest {
  return {
    key: "request" as ServerCache.CacheKey,
    model: { provider: "openai", modelId: "test" },
    params: { prompt: [] },
    meta,
  };
}

function actorResult(id: number | string, text?: string) {
  return AiSdkFactory.generateResult({
    ...(text === undefined ? {} : { text }),
    toolCalls: [AiSdkFactory.toolCall({ args: { id } })],
  });
}

function toolCallInputs(result: LanguageModelV4GenerateResult) {
  return AiSdk.toolCalls(result).map((toolCall) => {
    const input = AiSdk.toolCallInput(toolCall);
    if (input.kind !== "object") throw new Error("Expected object tool input");
    return input.value;
  });
}
