import { xxh64Str } from "@js-fns/xxhash/str";
import { describe, expect, it } from "vitest";
import { setupBeforeEach } from "../../../../tests/unit/mocks.ts";
import { AppId } from "../../../AppId.ts";
import { AiSdkFactory } from "../../../llm/__factories__/AiSdkFactory.ts";
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
    const generation = AiSdkFactory.generateResult({ text: "step1\nstep2" });

    await plannerCache.update({
      memoryKey,
      cacheHash: "hash" as ElementsCache.CacheHash,
      meta: {
        kind: "planner",
        goal: "login to app" as BaseAgent.Goal,
        treeXml: "<button id='1'>Login</button>",
      },
      generation,
    });

    expect(plannerCache.getRecord(memoryKey)).toEqual({
      cacheHash: "hash" as ElementsCache.CacheHash,
      generation,
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
      generation: AiSdkFactory.generateResult(),
    });

    expect(plannerCache.getEntries()).toEqual([]);
  });

  it("skips planner generation with no actions", async () => {
    const { memoryKey, plannerCache } = setup.cur;

    await plannerCache.update({
      memoryKey,
      cacheHash: "hash" as ElementsCache.CacheHash,
      meta: {
        kind: "planner",
        goal: "click upload" as BaseAgent.Goal,
        treeXml: "<button id='1'>Upload</button>",
      },
      generation: AiSdkFactory.generateResult({
        text: JSON.stringify({
          explanation: "No matching element",
          actions: [],
        }),
      }),
    });

    expect(plannerCache.getEntries()).toEqual([]);
  });

  it("allows element-free planner generation with actions", () => {
    const generation = AiSdkFactory.generateResult({
      text: JSON.stringify({
        explanation: "Navigate directly",
        actions: ['navigate to "https://example.com" URL'],
      }),
    });

    expect(PlannerAgentElementsCache.isCacheable(generation)).toBe(true);
  });

  it("updates elements while deduplicating by non-index attrs", () => {
    const { plannerCache, app } = setup.cur;
    const plannerHash = xxh64Str("ai-sdk-v1login") as ElementsCache.CacheHash;
    const plannerKey = "planner-memory" as ElementsCache.MemoryKey;
    const generation = AiSdkFactory.generateResult({ text: "step1" });

    plannerCache.setRecord({
      generation,
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
      generation,
      elements: [{ role: "button", name: "Login", index: 0 }],
      agentKind: "planner",
      app,
      instruction: { goal: "login" },
    });
  });
});
