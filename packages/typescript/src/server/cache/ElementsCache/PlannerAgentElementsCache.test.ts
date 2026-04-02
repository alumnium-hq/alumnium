import { describe, expect, it } from "vitest";
import { setupBeforeEach } from "../../../../tests/unit/mocks.ts";
import { AppId } from "../../../AppId.ts";
import { LchainFactory } from "../../../llm/__factories__/LchainFactory.ts";
import type { BaseAgent } from "../../agents/BaseAgent.ts";
import { SessionFactory } from "../../session/__factories__/SessionFactory.ts";
import type { ElementsCache } from "./ElementsCache.ts";
import { PlannerAgentElementsCache } from "./PlannerAgentElementsCache.ts";

describe("PlannerAgentElementsCache", () => {
  const setup = setupBeforeEach(() => {
    const sessionContext = SessionFactory.sessionContext();
    const plannerCache = new PlannerAgentElementsCache(sessionContext);
    const memoryKey = "planner-memory" as ElementsCache.MemoryKey;
    const cacheHash = "planner-hash" as ElementsCache.CacheHash;
    const app = AppId.parse("test-app");
    return {
      plannerCache,
      sessionContext,
      cacheHash,
      memoryKey,
      app,
    };
  });

  it("stores planner generation with empty elements", async () => {
    const { memoryKey, plannerCache } = setup.cur;

    await plannerCache.update({
      memoryKey,
      cacheHash: "hash" as ElementsCache.CacheHash,
      meta: {
        kind: "planner",
        goal: "login to app" as BaseAgent.Goal,
        treeXml: "<button id='1'>Login</button>",
      },
      generation: LchainFactory.storedGeneration({ text: "step1\nstep2" }),
    });

    expect(plannerCache.getRecord(memoryKey)).toEqual({
      cacheHash: "hash" as ElementsCache.CacheHash,
      generation: LchainFactory.storedGeneration({ text: "step1\nstep2" }),
      elements: [],
      agentKind: "planner",
      app: AppId.parse("test-app"),
      instruction: { goal: "login to app" },
    });
  });

  it("skips planner generation with empty content", async () => {
    const { memoryKey, plannerCache } = setup.cur;

    await plannerCache.update({
      memoryKey,
      cacheHash: "hash" as ElementsCache.CacheHash,
      meta: {
        kind: "planner",
        goal: "login to app" as BaseAgent.Goal,
        treeXml: "<button id='1'>Login</button>",
      },
      generation: LchainFactory.storedGeneration({ text: "" }),
    });

    expect(plannerCache.getEntries()).toEqual([]);
  });

  it("updates elements while deduplicating by non-index attrs", async () => {
    const { plannerCache, app } = setup.cur;

    const plannerHash = "planner-hash" as ElementsCache.CacheHash;
    const plannerKey = "planner-memory" as ElementsCache.MemoryKey;

    plannerCache.setRecord({
      generation: LchainFactory.storedGeneration({ text: "step1" }),
      memoryKey: plannerKey,
      cacheHash: plannerHash,
      agentKind: "planner",
      elements: [{ role: "button", name: "Login", index: 0 }],
      instruction: { goal: "login" },
    });

    plannerCache.updateElements("login", [
      { role: "button", name: "Login", index: 0 },
      { role: "button", name: "Login", index: 1 },
    ]);

    expect(plannerCache.getRecord(plannerKey)).toEqual({
      cacheHash: plannerHash,
      generation: LchainFactory.storedGeneration({ text: "step1" }),
      elements: [{ role: "button", name: "Login", index: 0 }],
      agentKind: "planner",
      app,
      instruction: { goal: "login" },
    });
  });
});
