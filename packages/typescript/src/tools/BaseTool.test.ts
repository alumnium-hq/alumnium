import { describe, expect, it, vi } from "vitest";
import { AppId } from "../AppId.ts";
import { BaseDriver } from "../drivers/BaseDriver.ts";
import type { Element } from "../drivers/index.ts";
import type { Keys } from "../drivers/keys.ts";
import {
  NavigationBlockedError,
  NavigationPolicy,
} from "../NavigationPolicy.ts";
import { BaseTool, type ToolClass } from "./BaseTool.ts";

describe(BaseTool, () => {
  describe("executeToolCall", () => {
    it("throws when the tool is not registered", async () => {
      const driver = new TestDriver();
      await expect(
        BaseTool.executeToolCall({ name: "Missing", args: {} }, {}, driver),
      ).rejects.toThrow("Tool Missing not found");
    });

    it("invokes the tool and checks the resulting URL against the default (always-on) policy", async () => {
      const driver = new TestDriver();
      const urlSpy = vi.spyOn(driver, "url");

      const result = await BaseTool.executeToolCall(
        { name: "Test", args: { value: "x" } },
        { Test: TestTool },
        driver,
      );

      expect(result).toBe("Test(value='x')");
      expect(driver.invoked).toBe(1);
      // Every driver gets a real NavigationPolicy by default now, so the post-invoke check
      // always runs — an empty currentUrl is exempted by NavigationPolicy.check(), not skipped
      // here.
      expect(urlSpy).toHaveBeenCalledTimes(1);
    });

    it("allows an ordinary tool call to a loopback URL with no config (open mode)", async () => {
      const driver = new TestDriver();
      driver.currentUrl = "http://localhost:3000/";

      await expect(
        BaseTool.executeToolCall(
          { name: "Test", args: {} },
          { Test: TestTool },
          driver,
        ),
      ).resolves.toBe("Test()");
    });

    it("blocks the always-on denylist even with no explicit policy configured", async () => {
      const driver = new TestDriver();
      driver.currentUrl = "http://169.254.169.254/latest/meta-data";

      await expect(
        BaseTool.executeToolCall(
          { name: "Test", args: {} },
          { Test: TestTool },
          driver,
        ),
      ).rejects.toThrow(NavigationBlockedError);
    });

    it("allows the call when the resulting URL matches the policy", async () => {
      const driver = new TestDriver();
      driver.navigationPolicy = NavigationPolicy.create({
        allowlistDomains: ["(^|\\.)airbnb\\.com$"],
      });
      driver.currentUrl = "https://www.airbnb.com/";

      await expect(
        BaseTool.executeToolCall(
          { name: "Test", args: {} },
          { Test: TestTool },
          driver,
        ),
      ).resolves.toBe("Test()");
    });

    it("blocks the call when the resulting URL is outside the policy", async () => {
      const driver = new TestDriver();
      driver.navigationPolicy = NavigationPolicy.create({
        allowlistDomains: ["(^|\\.)airbnb\\.com$"],
      });
      driver.currentUrl = "https://evil.example.com/";

      await expect(
        BaseTool.executeToolCall(
          { name: "Test", args: {} },
          { Test: TestTool },
          driver,
        ),
      ).rejects.toThrow(NavigationBlockedError);
      // The tool's side effect already ran — the check is a post-invoke guard.
      expect(driver.invoked).toBe(1);
    });
  });
});

class TestTool extends BaseTool {
  async invoke(driver: BaseDriver): Promise<void> {
    (driver as TestDriver).invoked += 1;
  }
}

class TestDriver extends BaseDriver {
  platform = "chromium" as const;
  supportedTools = new Set<ToolClass>();
  invoked = 0;
  currentUrl = "";

  protected fetchAccessibilityTree(): Promise<never> {
    throw new Error("Not implemented");
  }

  async url(): Promise<string> {
    return this.currentUrl;
  }

  click(): Promise<void> {
    throw new Error("Not implemented");
  }
  dragSlider(): void {
    throw new Error("Not implemented");
  }
  dragAndDrop(): Promise<void> {
    throw new Error("Not implemented");
  }
  pressKey(_key: Keys.Key): Promise<void> {
    throw new Error("Not implemented");
  }
  quit(): Promise<void> {
    throw new Error("Not implemented");
  }
  back(): Promise<void> {
    throw new Error("Not implemented");
  }
  screenshot(): Promise<string> {
    throw new Error("Not implemented");
  }
  title(): Promise<string> {
    throw new Error("Not implemented");
  }
  type(): Promise<void> {
    throw new Error("Not implemented");
  }
  app(): Promise<AppId> {
    throw new Error("Not implemented");
  }
  findElement(): Promise<Element> {
    throw new Error("Not implemented");
  }
  visit(): Promise<void> {
    throw new Error("Not implemented");
  }
  scrollTo(): Promise<void> {
    throw new Error("Not implemented");
  }
  executeScript(): Promise<void> {
    throw new Error("Not implemented");
  }
  switchToNextTab(): Promise<void> {
    throw new Error("Not implemented");
  }
  switchToPreviousTab(): Promise<void> {
    throw new Error("Not implemented");
  }
  wait(): Promise<void> {
    throw new Error("Not implemented");
  }
  waitForSelector(): Promise<void> {
    throw new Error("Not implemented");
  }
  printToPdf(): Promise<void> {
    throw new Error("Not implemented");
  }
}
