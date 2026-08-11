import type { WebDriver } from "selenium-webdriver";
import { describe, expect, it, vi } from "vitest";
import type { BaseAccessibilityTree } from "../accessibility/BaseAccessibilityTree.ts";
import { TestTreeFactory } from "./__factories__/TestTreeFactory.ts";
import { SeleniumDriver } from "./SeleniumDriver.ts";

describe("SeleniumDriver", () => {
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
