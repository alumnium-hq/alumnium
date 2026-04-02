import { describe, expect, it, vi } from "vitest";
import { pushMock, setupBeforeEach } from "../../../../tests/unit/mocks.ts";
import { AppId } from "../../../AppId.ts";
import { LchainFactory } from "../../../llm/__factories__/LchainFactory.ts";
import type { BaseAgent } from "../../agents/BaseAgent.ts";
import { SessionFactory } from "../../session/__factories__/SessionFactory.ts";
import { ActorAgentElementsCache } from "./ActorAgentElementsCache.ts";
import type { ElementsCache } from "./ElementsCache.ts";
import { PlannerAgentElementsCache } from "./PlannerAgentElementsCache.ts";

describe("ActorAgentElementsCache", () => {
  const setup = setupBeforeEach(() => {
    const sessionContext = SessionFactory.sessionContext();
    const plannerCache = new PlannerAgentElementsCache(sessionContext);
    const actorCache = new ActorAgentElementsCache({
      plannerCache,
      sessionContext,
    });
    const memoryKey = "actor-memory" as ElementsCache.MemoryKey;
    const cacheHash = "actor-hash" as ElementsCache.CacheHash;
    const app = AppId.parse("test-app");
    return {
      actorCache,
      plannerCache,
      sessionContext,
      cacheHash,
      memoryKey,
      app,
    };
  });

  it("caches generation with extracted elements", async () => {
    const { actorCache, cacheHash, memoryKey, app } = setup.cur;

    await actorCache.update({
      memoryKey,
      cacheHash,
      meta: {
        kind: "actor",
        goal: "login" as BaseAgent.Goal,
        step: "click login button" as BaseAgent.Step,
        treeXml: '<button id="1" name="Login"/><input id="2" name="username"/>',
      },
      generation: LchainFactory.storedGenerationWith({
        toolCalls: [
          LchainFactory.toolCall({ name: "ClickTool", args: { id: 1 } }),
        ],
      }),
    });

    const entry = actorCache.getRecord(memoryKey);
    expect(entry).toEqual({
      agentKind: "actor",
      app,
      cacheHash,
      elements: [{ index: 0, name: "Login", role: "button" }],
      generation: LchainFactory.storedGenerationWith({
        toolCalls: [
          LchainFactory.toolCall({
            args: { id: "<MASKED_0>" },
            name: "ClickTool",
          }),
        ],
      }),
      instruction: {
        goal: "login",
        step: "click login button",
      },
    });
  });

  it("skips caching without tool calls", async () => {
    const { actorCache, cacheHash, memoryKey } = setup.cur;

    await actorCache.update({
      memoryKey,
      cacheHash,
      meta: {
        kind: "actor",
        goal: "login" as BaseAgent.Goal,
        step: "click login button" as BaseAgent.Step,
        treeXml: '<button id="1" name="Login"/>',
      },
      generation: LchainFactory.storedGeneration(),
    });

    expect(actorCache.getEntries()).toEqual([]);
  });

  it("skips caching when no element ids can be extracted", async () => {
    const { actorCache, cacheHash, memoryKey } = setup.cur;

    await actorCache.update({
      memoryKey,
      cacheHash,
      meta: {
        kind: "actor",
        goal: "go back" as BaseAgent.Goal,
        step: "navigate back" as BaseAgent.Step,
        treeXml: '<button id="1" name="Login"/>',
      },
      generation: LchainFactory.storedGenerationWith({
        toolCalls: [
          LchainFactory.toolCall({ name: "NavigateBackTool", args: {} }),
        ],
      }),
    });

    expect(actorCache.getEntries()).toEqual([]);
  });

  it("updates planner elements", async () => {
    const { plannerCache, actorCache, cacheHash, memoryKey } = setup.cur;

    const updateElements = vi
      .spyOn(plannerCache, "updateElements")
      .mockImplementation(() => {});
    pushMock(updateElements);

    await actorCache.update({
      memoryKey,
      cacheHash,
      meta: {
        kind: "actor",
        goal: "login" as BaseAgent.Goal,
        step: "click login button" as BaseAgent.Step,
        treeXml: '<button id="10" name="Login"/><button id="11" name="Login"/>',
      },
      generation: LchainFactory.storedGenerationWith({
        toolCalls: [
          LchainFactory.toolCall({ name: "ClickTool", args: { id: 10 } }),
          LchainFactory.toolCall({ name: "ClickTool", args: { id: 11 } }),
        ],
      }),
    });

    expect(updateElements).toHaveBeenCalledWith("login", [
      { role: "button", name: "Login", index: 0 },
      { role: "button", name: "Login", index: 1 },
    ]);
  });
});
