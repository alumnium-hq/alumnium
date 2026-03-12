import { describe, expect, it, spyOn } from "bun:test";
import {
  createMockDir,
  pushMock,
  setupBeforeEach,
} from "../../../../tests/mocks.js";
import { AppId } from "../../../AppId.js";
import { FsStore } from "../../../FsStore.js";
import { LchainFactory } from "../../../llm/__factories__/LchainFactory.js";
import { Lchain } from "../../../llm/Lchain.js";
import { LlmContext } from "../../LlmContext.js";
import { SessionContext } from "../../session/SessionContext.js";
import { SessionId } from "../../session/SessionId.js";
import { CacheStore } from "../CacheStore.js";
import { ElementsCache } from "./ElementsCache.js";

describe("ElementsCache", () => {
  const setup = setupBeforeEach(async () => {
    const sessionContext = new SessionContext({
      app: "test-app" as AppId,
      sessionId: "test-session-id" as SessionId,
    });

    const cacheDir = await createMockDir({ prefix: "elements-cache" });

    pushMock(spyOn(FsStore, "globalSubDir").mockReturnValue(cacheDir.path));
    const cacheStore = new CacheStore(sessionContext);

    const llmContext = new LlmContext();

    const cache = new ElementsCache(sessionContext, cacheStore, llmContext);

    const prompt1 = "prompt 1" as LlmContext.Prompt;
    const prompt2 = "prompt 2" as LlmContext.Prompt;
    const llmKey = "test-llm" as LlmContext.LlmKey;

    const treeXml = '<button id="1" name="Login" />';

    return {
      sessionContext,
      cacheStore,
      cacheDir,
      llmContext,
      cache,
      prompt1,
      prompt2,
      llmKey,
      treeXml,
    };
  });

  describe("lookup", () => {
    it("resolves null for prompts without assigned metadata", async () => {
      const { cache, prompt1, llmKey } = setup.cur;

      expect(await cache.lookup(prompt1, llmKey)).toBeNull();
    });

    it("resolves null when it for unsupported agent prompts", async () => {
      const { llmContext, cache, prompt1, llmKey } = setup.cur;
      llmContext.assignPromptsMeta([prompt1], {
        type: "locator",
        description: "test",
        treeXml: "<div />",
      });

      expect(await cache.lookup(prompt1, llmKey)).toBe(null);
    });

    describe("planner agent", () => {
      it("resolves cached response for exact match", async () => {
        const { llmContext, cache, prompt1, llmKey, treeXml } = setup.cur;
        llmContext.assignPromptsMeta([prompt1], {
          type: "planner",
          goal: "click login",
          treeXml: treeXml,
        });
        const generation = LchainFactory.generation({ text: "step1" });

        await cache.update(prompt1, llmKey, [generation]);
        await cache.save();

        const result = await cache.lookup(prompt1, llmKey);

        expect(Lchain.toStored(result![0]!)).toEqual(
          Lchain.toStored(generation),
        );
      });

      it("resolves null if app does not match", async () => {
        const { sessionContext, llmContext, cache, prompt1, llmKey, treeXml } =
          setup.cur;
        llmContext.assignPromptsMeta([prompt1], {
          type: "planner",
          goal: "click login",
          treeXml: treeXml,
        });
        const generation = LchainFactory.generation({ text: "step1" });

        await cache.update(prompt1, llmKey, [generation]);
        await cache.save();

        sessionContext.update({ app: "different-app" as AppId });

        const result = await cache.lookup(prompt1, llmKey);

        expect(result).toBeNull();
      });

      it("ignores malformed accessibility tree", async () => {
        const { llmContext, cache, prompt1, llmKey } = setup.cur;
        llmContext.assignPromptsMeta([prompt1], {
          type: "planner",
          goal: "click login",
          treeXml: '<button id="1',
        });

        await cache.update(prompt1, llmKey, [
          LchainFactory.generationWith({ text: "step1" }),
        ]);
        await cache.save();

        const result = await cache.lookup(prompt1, llmKey);

        expect(Lchain.toStored(result![0]!)).toEqual(
          LchainFactory.storedGenerationWith({
            text: "step1",
          }),
        );
      });
    });

    describe("actor agent", () => {
      it("resolves cached response for exact match", async () => {
        const { llmContext, cache, prompt1, llmKey, treeXml } = setup.cur;
        llmContext.assignPromptsMeta([prompt1], {
          type: "actor",
          step: 'Click "Login" button',
          goal: "login",
          treeXml: treeXml,
        });
        const generation = LchainFactory.generationWith({
          text: "step1",
          toolCalls: [{ name: "ClickTool", args: { id: 1 } }],
        });

        await cache.update(prompt1, llmKey, [generation]);
        await cache.save();

        const result = await cache.lookup(prompt1, llmKey);

        expect(Lchain.toStored(result![0]!)).toEqual(
          LchainFactory.storedGenerationWith({
            text: "step1",
            toolCalls: [{ name: "ClickTool", args: { id: 1 } }],
          }),
        );
      });

      it("resolves null if app does not match", async () => {
        const { sessionContext, llmContext, cache, prompt1, llmKey, treeXml } =
          setup.cur;
        llmContext.assignPromptsMeta([prompt1], {
          type: "actor",
          step: 'Click "Login" button',
          goal: "login",
          treeXml: treeXml,
        });
        const generation = LchainFactory.generationWith({
          text: "step1",
          toolCalls: [{ name: "ClickTool", args: { id: 1 } }],
        });

        await cache.update(prompt1, llmKey, [generation]);
        await cache.save();

        sessionContext.update({ app: "different-app" as AppId });

        const result = await cache.lookup(prompt1, llmKey);

        expect(result).toBeNull();
      });

      it("resolves actor ids in similar trees with changed ids", async () => {
        const { llmContext, cache, prompt1, prompt2, llmKey } = setup.cur;
        llmContext.assignPromptsMeta([prompt1], {
          type: "actor",
          step: 'Click "Login" button',
          goal: "login",
          treeXml: '<button id="1" name="Login" />',
        });
        llmContext.assignPromptsMeta([prompt2], {
          type: "actor",
          step: 'Click "Login" button',
          goal: "login",
          treeXml: '<div><button id="99" name="Login" /></div>',
        });
        const generation = LchainFactory.generationWith({
          toolCalls: [{ name: "ClickTool", args: { id: 1 } }],
        });

        await cache.update(prompt1, llmKey, [generation]);
        await cache.save();

        const result1 = await cache.lookup(prompt1, llmKey);

        expect(result1?.map(Lchain.toStored)).toEqual([
          LchainFactory.storedGenerationWith({
            toolCalls: [{ name: "ClickTool", args: { id: 1 } }],
          }),
        ]);

        const result2 = await cache.lookup(prompt2, llmKey);

        expect(result2?.map(Lchain.toStored)).toEqual([
          LchainFactory.storedGenerationWith({
            toolCalls: [{ name: "ClickTool", args: { id: 99 } }],
          }),
        ]);
      });

      it("resolves null when cached elements cannot be resolved", async () => {
        const { llmContext, cache, prompt1, prompt2, llmKey } = setup.cur;
        llmContext.assignPromptsMeta([prompt1], {
          type: "actor",
          step: "click login",
          goal: "login",
          treeXml: '<button id="1" name="Login" />',
        });
        llmContext.assignPromptsMeta([prompt2], {
          type: "actor",
          step: "click login",
          goal: "login",
          treeXml: '<button id="9" name="Logout" />',
        });

        await cache.update(prompt1, llmKey, [
          LchainFactory.generationWith({
            toolCalls: [{ name: "ClickTool", args: { id: 1 } }],
          }),
        ]);
        await cache.save();

        expect(await cache.lookup(prompt2, llmKey)).toBeNull();
      });

      it("returns null on malformed accessibility tree", async () => {
        const { llmContext, cache, prompt1, llmKey } = setup.cur;
        llmContext.assignPromptsMeta([prompt1], {
          type: "actor",
          step: "click login",
          goal: "login",
          treeXml: '<button id="1',
        });

        await cache.update(prompt1, llmKey, [
          LchainFactory.generationWith({
            toolCalls: [{ name: "ClickTool", args: { id: 1 } }],
          }),
        ]);
        await cache.save();

        expect(await cache.lookup(prompt1, llmKey)).toBeNull();
      });

      describe("fuzzy lookup", () => {
        it("uses fuzzy lookup for near-matching actor step", async () => {
          const { llmContext, cache, prompt1, prompt2, llmKey } = setup.cur;
          llmContext.assignPromptsMeta([prompt1], {
            type: "actor",
            goal: "submit form",
            step: 'Click "Submit" button',
            treeXml: '<button id="1" name="Submit" />',
          });
          llmContext.assignPromptsMeta([prompt2], {
            type: "actor",
            goal: "submit form",
            step: 'Click the "Submit" button',
            treeXml: '<button id="7" name="Submit" />',
          });
          const generation = LchainFactory.generationWith({
            toolCalls: [{ name: "ClickTool", args: { id: 1 } }],
          });

          await cache.update(prompt1, llmKey, [generation]);
          await cache.save();

          const result = await cache.lookup(prompt2, llmKey);

          expect(Lchain.toStored(result![0]!)).toEqual(
            LchainFactory.storedGenerationWith({
              toolCalls: [{ name: "ClickTool", args: { id: 7 } }],
            }),
          );
        });

        it("uses fuzzy lookup for memory records", async () => {
          const { llmContext, cache, prompt1, prompt2, llmKey } = setup.cur;
          llmContext.assignPromptsMeta([prompt1], {
            type: "actor",
            goal: "submit form",
            step: 'Click "Submit" button',
            treeXml: '<button id="1" name="Submit" />',
          });
          llmContext.assignPromptsMeta([prompt2], {
            type: "actor",
            goal: "submit form",
            step: 'Click the "Submit" button',
            treeXml: '<button id="8" name="Submit" />',
          });
          await cache.update(prompt1, llmKey, [
            LchainFactory.generationWith({
              toolCalls: [{ name: "ClickTool", args: { id: 1 } }],
            }),
          ]);

          const result = await cache.lookup(prompt2, llmKey);

          expect(Lchain.toStored(result![0]!)).toEqual(
            LchainFactory.storedGenerationWith({
              toolCalls: [{ name: "ClickTool", args: { id: 8 } }],
            }),
          );
        });

        it("returns null for fuzzy misses below threshold", async () => {
          const { llmContext, cache, prompt1, prompt2, llmKey } = setup.cur;

          llmContext.assignPromptsMeta([prompt1], {
            type: "actor",
            goal: "save",
            step: 'Click the "Save" button',
            treeXml: '<button id="1" name="Save" />',
          });
          llmContext.assignPromptsMeta([prompt2], {
            type: "actor",
            goal: "save",
            step: 'Type "hello" into the search field',
            treeXml: '<button id="2" name="Save" />',
          });

          await cache.update(prompt1, llmKey, [
            LchainFactory.generationWith({
              toolCalls: [{ name: "ClickTool", args: { id: 1 } }],
            }),
          ]);
          await cache.save();

          expect(await cache.lookup(prompt2, llmKey)).toBeNull();
        });
      });
    });
  });

  describe("update", () => {
    it("uses updated app context for path names", async () => {
      const { sessionContext, llmContext, cache, prompt1, llmKey, cacheDir } =
        setup.cur;
      llmContext.assignPromptsMeta([prompt1], {
        type: "planner",
        goal: "click login",
        treeXml: '<button id="1" name="Login" />',
      });

      const app = "staging.airbnb.com" as AppId;

      sessionContext.update({ app });
      await cache.update(prompt1, llmKey, [
        LchainFactory.generation({ text: "step1" }),
      ]);
      await cache.save();

      const baseDir = `${app}/azure_openai/gpt-5-nano/elements/planner/b1e9b737`;
      expect(await cacheDir.flatTree()).toEqual([
        `${baseDir}/response.json`,
        `${baseDir}/instruction.json`,
        `${baseDir}/elements.json`,
      ]);
    });

    describe("planner agent", () => {
      it("stores instruction, response, and empty elements", async () => {
        const {
          sessionContext,
          cacheStore,
          llmContext,
          prompt1,
          llmKey,
          cacheDir,
        } = setup.cur;
        llmContext.assignPromptsMeta([prompt1], {
          type: "planner",
          goal: "login to app",
          treeXml: '<button id="1">Login</button>',
        });
        const generation = LchainFactory.generation({ text: "step1\nstep2" });

        const cache = new ElementsCache(sessionContext, cacheStore, llmContext);
        await cache.update(prompt1, llmKey, [generation]);
        await cache.save();

        const baseDir =
          "test-app/azure_openai/gpt-5-nano/elements/planner/1504cea3";
        const responsePath = `${baseDir}/response.json`;
        const instructionPath = `${baseDir}/instruction.json`;
        const elementsPath = `${baseDir}/elements.json`;
        expect(await cacheDir.flatTree()).toEqual([
          responsePath,
          instructionPath,
          elementsPath,
        ]);

        const [response, instruction, elements] = await Promise.all([
          cacheDir.readJson(responsePath),
          cacheDir.readJson(instructionPath),
          cacheDir.readJson(elementsPath),
        ]);

        expect(response).toEqual(Lchain.toStored(generation));
        expect(instruction).toEqual({
          goal: "login to app",
        });
        expect(elements).toEqual([]);
      });
    });

    describe("actor agent", () => {
      it("stores instruction and masked response and elements", async () => {
        const {
          sessionContext,
          cacheStore,
          llmContext,
          prompt1,
          llmKey,
          cacheDir,
        } = setup.cur;
        llmContext.assignPromptsMeta([prompt1], {
          type: "actor",
          step: 'Click "Login" button',
          goal: "login",
          treeXml: '<button id="1" name="Login" />',
        });
        const text = "step1\nstep2";
        const generation = LchainFactory.generationWith({
          text,
          toolCalls: [{ name: "ClickTool", args: { id: 1 } }],
        });

        const cache = new ElementsCache(sessionContext, cacheStore, llmContext);
        await cache.update(prompt1, llmKey, [generation]);
        await cache.save();

        const baseDir =
          "test-app/azure_openai/gpt-5-nano/elements/actor/e4314b69";
        const responsePath = `${baseDir}/response.json`;
        const instructionPath = `${baseDir}/instruction.json`;
        const elementsPath = `${baseDir}/elements.json`;
        expect(await cacheDir.flatTree()).toEqual([
          responsePath,
          instructionPath,
          elementsPath,
        ]);

        const [response, instruction, elements] = await Promise.all([
          cacheDir.readJson(responsePath),
          cacheDir.readJson(instructionPath),
          cacheDir.readJson(elementsPath),
        ]);

        expect(response).toEqual(
          LchainFactory.storedGenerationWith({
            text,
            toolCalls: [{ name: "ClickTool", args: { id: "<MASKED_0>" } }],
          }),
        );
        expect(instruction).toEqual({
          step: 'Click "Login" button',
          goal: "login",
        });
        expect(elements).toEqual([
          {
            role: "button",
            index: 0,
            name: "Login",
          },
        ]);
      });
    });
  });

  describe("discard", () => {
    it("discards memory cache", async () => {
      const {
        sessionContext,
        cacheStore,
        llmContext,
        prompt1,
        llmKey,
        cacheDir,
        treeXml,
      } = setup.cur;
      llmContext.assignPromptsMeta([prompt1], {
        type: "planner",
        goal: "click login",
        treeXml: treeXml,
      });

      const cache = new ElementsCache(sessionContext, cacheStore, llmContext);
      await cache.update(prompt1, llmKey, [
        LchainFactory.generation({ text: "step1" }),
      ]);
      await cache.discard();
      await cache.save();

      expect(await cacheDir.flatTree()).toEqual([]);
    });
  });

  describe("clear", () => {
    it("removes all cached files", async () => {
      const { llmContext, cache, prompt1, llmKey, cacheDir, treeXml } =
        setup.cur;
      llmContext.assignPromptsMeta([prompt1], {
        type: "planner",
        goal: "click login",
        treeXml: treeXml,
      });

      await cache.update(prompt1, llmKey, [
        LchainFactory.generation({ text: "step1" }),
      ]);
      await cache.save();

      expect((await cacheDir.flatTree()).length).toBe(3);

      await cache.clear();

      expect(await cacheDir.flatTree()).toEqual([]);
    });
  });

  describe("usage", () => {
    it("tracks usage when lookup hits", async () => {
      const { llmContext, cache, prompt1, llmKey } = setup.cur;
      llmContext.assignPromptsMeta([prompt1], {
        type: "planner",
        goal: "click login",
        treeXml: '<button id="1" name="Login" />',
      });

      expect(cache.usage).toEqual({
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      });

      await cache.update(prompt1, llmKey, [
        LchainFactory.generationWith({
          text: "step1",
          usage: {
            input_tokens: 5,
            output_tokens: 10,
            total_tokens: 15,
          },
        }),
      ]);
      await cache.save();

      await cache.lookup(prompt1, llmKey);

      expect(cache.usage).toEqual({
        input_tokens: 5,
        output_tokens: 10,
        total_tokens: 15,
      });

      await cache.lookup(prompt1, llmKey);

      expect(cache.usage).toEqual({
        input_tokens: 10,
        output_tokens: 20,
        total_tokens: 30,
      });
    });
  });
});
