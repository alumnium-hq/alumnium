import type { Generation } from "@langchain/core/outputs";
import { describe, expect, it, spyOn } from "bun:test";
import {
  createMockDir,
  pushMock,
  setupBeforeEach,
} from "../../../../tests/mocks.js";
import { AppId } from "../../../AppId.js";
import { FsStore } from "../../../FsStore.js";
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

    const prompt1 = "prompt 1" as LlmContext.Prompt;
    const prompt2 = "prompt 2" as LlmContext.Prompt;
    const llmKey = "test-llm" as LlmContext.LlmKey;

    return {
      sessionContext,
      cacheStore,
      cacheDir,
      llmContext,
      prompt1,
      prompt2,
      llmKey,
    };
  });

  describe("unsupported agent", () => {
    it("lookup resolves null when it for unsupported agent prompts", async () => {
      const { sessionContext, cacheStore, llmContext, prompt1, llmKey } =
        setup.cur;
      llmContext.assignPromptsMeta([prompt1], {
        type: "locator",
        description: "test",
        accessibilityTreeXml: "<div/>",
      });

      const cache = new ElementsCache(sessionContext, cacheStore, llmContext);

      expect(await cache.lookup(prompt1, llmKey)).toBe(null);
    });
  });

  describe("planner agent", () => {
    it("returns null when there is no cache", async () => {
      const { sessionContext, cacheStore, llmContext, prompt1, llmKey } =
        setup.cur;

      const cache = new ElementsCache(sessionContext, cacheStore, llmContext);

      expect(await cache.lookup(prompt1, llmKey)).toBe(null);
    });

    it("saves instruction and empty elements", async () => {
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
        accessibilityTreeXml: "<button id='1'>Login</button>",
      });
      const generation = createGeneration("step1\nstep2");

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
    it.todo(
      "saves extracted elements and instruction for actor prompts",
      async () => {
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
          step: "login",
          goal: "click login",
          accessibilityTreeXml:
            '<button id="1" name="Login"/>\n<input id="2" name="username"/>',
        });
        const generation = createGeneration("", [
          { name: "ClickTool", args: { id: 1 } },
        ]);

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
      },
    );
  });
});

function createGeneration(
  text: string,
  toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [],
): Generation {
  return Lchain.fromStored({
    text,
    message: {
      type: "system",
      data: {
        content: text,
        tool_calls: toolCalls,
        response_metadata: {},
        additional_kwargs: {},
      },
    },
  });
}
