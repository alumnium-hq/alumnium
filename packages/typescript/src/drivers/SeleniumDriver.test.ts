import type { WebDriver } from "selenium-webdriver";
import { describe, expect, it, vi } from "vitest";
import type { BaseAccessibilityTree } from "../accessibility/BaseAccessibilityTree.ts";
import { TestTreeFactory } from "./__factories__/TestTreeFactory.ts";
import { SeleniumDriver } from "./SeleniumDriver.ts";

describe("SeleniumDriver", () => {
  describe("quit", () => {
    it("waits for CDP initialization before quitting WebDriver", async () => {
      let resolveCapabilities: (() => void) | undefined;
      const getCapabilities = vi.fn(
        () =>
          new Promise<{ get: () => undefined }>((resolve) => {
            resolveCapabilities = () => resolve({ get: () => undefined });
          }),
      );
      const sendAndGetDevToolsCommand = vi.fn(async () => undefined);
      const quit = vi.fn(async () => undefined);
      const driver = new SeleniumDriver({
        getCapabilities,
        sendAndGetDevToolsCommand,
        quit,
      } as unknown as WebDriver);

      const quitting = driver.quit();
      await Promise.resolve();

      expect(quit).not.toHaveBeenCalled();
      resolveCapabilities?.();
      await quitting;
      expect(sendAndGetDevToolsCommand).toHaveBeenCalledWith(
        "Page.addScriptToEvaluateOnNewDocument",
        expect.objectContaining({ runImmediately: true }),
      );
      expect(quit).toHaveBeenCalledOnce();
    });

    it("still quits when CDP initialization and waiter fallback fail", async () => {
      const quit = vi.fn(async () => undefined);
      const driver = new SeleniumDriver({
        getCapabilities: vi.fn(async () => ({ get: () => undefined })),
        sendAndGetDevToolsCommand: vi.fn(async () => {
          throw new Error("ChromeDriver unavailable");
        }),
        quit,
      } as unknown as WebDriver);

      await expect(driver.quit()).resolves.toBeUndefined();
      expect(quit).toHaveBeenCalledOnce();
    });
  });

  it("serializes AX nodes without mutable metadata", async () => {
    const sendAndGetDevToolsCommand = vi.fn(async (command: string) => {
      if (command === "Page.getFrameTree") {
        return {
          frameTree: {
            frame: { id: "main", url: "https://example.com" },
          },
        };
      }
      if (command === "DOM.getFlattenedDocument") {
        return {
          nodes: [{ nodeId: 1, backendNodeId: 43, nodeType: 1 }],
        };
      }
      if (command === "Accessibility.getFullAXTree") {
        return {
          nodes: [
            {
              nodeId: "ax-1",
              backendDOMNodeId: 43,
              role: { value: "button" },
            },
          ],
        };
      }
      return {};
    });
    const webdriver = {
      switchTo: () => ({ defaultContent: vi.fn(async () => undefined) }),
      executeScript: vi.fn(async () => ({
        lastMutationAt: 0,
        now: performance.now(),
        pendingTimeouts: 0,
        readyState: "complete",
      })),
      executeAsyncScript: vi.fn(async () => undefined),
      sendAndGetDevToolsCommand,
    };
    const driver = new FetchTestSeleniumDriver(
      webdriver as unknown as WebDriver,
    );

    await expect(driver.fetchTree().then((tree) => tree.toStr())).resolves.toBe(
      '<button raw_id=1 backendDOMNodeId=43 nodeId="ax-1" />',
    );
    expect(sendAndGetDevToolsCommand).toHaveBeenCalledWith(
      "DOM.getFlattenedDocument",
      { depth: -1, pierce: true },
    );
  });

  describe("drill probe", () => {
    it("runs the Selenium CDP probe and restores default content", async () => {
      const defaultContent = vi.fn(async () => undefined);
      const sendAndGetDevToolsCommand = vi.fn(async (command: string) => {
        if (command === "DOM.pushNodesByBackendIdsToFrontend") {
          return { nodeIds: [8] };
        }
        return {};
      });
      const webdriver = {
        switchTo: () => ({ defaultContent }),
        sendAndGetDevToolsCommand,
      };
      const driver = new TestSeleniumDriver(webdriver as unknown as WebDriver);

      await expect(
        driver.probe(TestTreeFactory.tree({ backendNodeId: 43 }), 1),
      ).resolves.toBe(43);
      expect(sendAndGetDevToolsCommand).toHaveBeenCalledWith(
        "DOM.setAttributeValue",
        expect.objectContaining({ nodeId: 8, name: "data-alumnium-drill" }),
      );
      expect(sendAndGetDevToolsCommand).toHaveBeenCalledWith(
        "DOM.removeAttribute",
        { nodeId: 8, name: "data-alumnium-drill" },
      );
      expect(defaultContent).toHaveBeenCalledTimes(2);
    });

    it("reports Selenium cleanup failures after restoring default content", async () => {
      const cleanupError = new Error("cleanup failed");
      const defaultContent = vi.fn(async () => undefined);
      const sendAndGetDevToolsCommand = vi.fn(async (command: string) => {
        if (command === "DOM.pushNodesByBackendIdsToFrontend") {
          return { nodeIds: [8] };
        }
        if (command === "DOM.removeAttribute") throw cleanupError;
        return {};
      });
      const webdriver = {
        switchTo: () => ({ defaultContent }),
        sendAndGetDevToolsCommand,
      };
      const driver = new TestSeleniumDriver(webdriver as unknown as WebDriver);

      await expect(
        driver.probe(TestTreeFactory.tree({ backendNodeId: 43 }), 1),
      ).rejects.toMatchObject({ stage: "probe", cause: cleanupError });
      expect(defaultContent).toHaveBeenCalledTimes(2);
    });

    class TestSeleniumDriver extends SeleniumDriver {
      probe(tree: BaseAccessibilityTree, rawId: number): Promise<number> {
        return this.devDrillProbeTree(tree, rawId);
      }
    }
  });
});

class FetchTestSeleniumDriver extends SeleniumDriver {
  fetchTree(): Promise<BaseAccessibilityTree> {
    return this.fetchAccessibilityTree();
  }
}
