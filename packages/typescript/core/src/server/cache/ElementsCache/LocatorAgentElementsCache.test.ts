import { describe, expect, it } from "vitest";
import { setupBeforeEach } from "../../../../../alumnium/tests/unit/mocks.ts";
import { AppId } from "../../../AppId.ts";
import { AiSdkFactory } from "../../../llm/__factories__/AiSdkFactory.ts";
import { SessionFactory } from "../../session/__factories__/SessionFactory.ts";
import type { ElementsCache } from "./ElementsCache.ts";
import { LocatorAgentElementsCache } from "./LocatorAgentElementsCache.ts";

describe("LocatorAgentElementsCache", () => {
  const setup = setupBeforeEach(() => {
    const locatorCache = new LocatorAgentElementsCache(
      SessionFactory.sessionContext(),
    );
    const memoryKey = "locator-memory" as ElementsCache.MemoryKey;
    const cacheHash = "locator-hash" as ElementsCache.CacheHash;
    const app = AppId.parse("test-app");
    return { locatorCache, cacheHash, memoryKey, app };
  });

  const treeXml =
    '<button id="1" name="Login"/><input id="2" name="username"/>';

  it("caches structured output text with masked id and extracted element", async () => {
    const { locatorCache, cacheHash, memoryKey, app } = setup.cur;

    await locatorCache.update({
      memoryKey,
      cacheHash,
      meta: { kind: "locator", description: "login button", treeXml },
      generation: AiSdkFactory.generateResult({
        text: JSON.stringify({ explanation: "Login button", id: 1 }),
      }),
    });

    expect(locatorCache.getRecord(memoryKey)).toEqual({
      agentKind: "locator",
      app,
      cacheHash,
      elements: [{ index: 0, name: "Login", role: "button" }],
      generation: AiSdkFactory.generateResult({
        text: JSON.stringify({
          explanation: "Login button",
          id: "<MASKED_0>",
        }),
      }),
      instruction: { description: "login button" },
    });
  });

  it("caches structured output returned as a tool call", async () => {
    const { locatorCache, cacheHash, memoryKey } = setup.cur;

    await locatorCache.update({
      memoryKey,
      cacheHash,
      meta: { kind: "locator", description: "username input", treeXml },
      generation: AiSdkFactory.generateResult({
        toolCalls: [
          AiSdkFactory.toolCall({
            name: "json",
            args: { explanation: "Username", id: 2 },
          }),
        ],
      }),
    });

    const record = locatorCache.getRecord(memoryKey);
    expect(record?.elements).toEqual([
      { index: 0, name: "username", role: "input" },
    ]);
    expect(record?.generation.content).toEqual([
      AiSdkFactory.toolCall({
        name: "json",
        args: { explanation: "Username", id: "<MASKED_0>" },
      }),
    ]);
  });

  it("skips caching without a located element", async () => {
    const { locatorCache, cacheHash, memoryKey } = setup.cur;

    await locatorCache.update({
      memoryKey,
      cacheHash,
      meta: { kind: "locator", description: "login button", treeXml },
      generation: AiSdkFactory.generateResult({ text: "not json" }),
    });

    expect(locatorCache.getRecord(memoryKey)).toBeNull();
  });

  it("skips caching when the located element is not in the tree", async () => {
    const { locatorCache, cacheHash, memoryKey } = setup.cur;

    await locatorCache.update({
      memoryKey,
      cacheHash,
      meta: { kind: "locator", description: "login button", treeXml },
      generation: AiSdkFactory.generateResult({
        text: JSON.stringify({ explanation: "Missing", id: 99 }),
      }),
    });

    expect(locatorCache.getRecord(memoryKey)).toBeNull();
  });
});
