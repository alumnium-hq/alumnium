import type { Browser } from "webdriverio";
import { describe, expect, it, vi } from "vitest";
import type { BaseAccessibilityTree } from "../accessibility/BaseAccessibilityTree.ts";
import { TreeDevDrillError } from "../tree/dev/TreeDevDrillError.ts";
import { AppiumDriver } from "./AppiumDriver.ts";
import { TestTreeFactory } from "./__factories__/TestTreeFactory.ts";

describe("AppiumDriver", () => {
  describe("drill probe", () => {
    it.each([
      [
        "android",
        {
          type: "android.widget.Button",
          androidResourceId: "app:id/save",
          androidBounds: "[0,0][10,10]",
        },
        '//android.widget.Button[@resource-id="app:id/save" and @bounds="[0,0][10,10]"]',
      ],
      [
        "iOS",
        { type: "XCUIElementTypeButton", name: "Save", label: "Save" },
        '-ios predicate string:type == "XCUIElementTypeButton" AND name == "Save" AND label == "Save"',
      ],
    ] as const)(
      "forces the %s native locator",
      async (platformName, element, locator) => {
        const isExisting = vi.fn(async () => true);
        const dollar = vi.fn(() => ({ isExisting }));
        const webdriver = {
          capabilities: { platformName },
          $: dollar,
        };
        const driver = new TestAppiumDriver(webdriver as unknown as Browser);

        await expect(
          driver.probe(TestTreeFactory.tree(element), 1),
        ).resolves.toBe(locator);
        expect(dollar).toHaveBeenCalledWith(locator);
        expect(isExisting).toHaveBeenCalledOnce();
      },
    );

    it("retains a failing native locator as probe metadata", async () => {
      const webdriver = {
        capabilities: { platformName: "android" },
        $: vi.fn(() => ({ isExisting: vi.fn(async () => false) })),
      };
      const driver = new TestAppiumDriver(webdriver as unknown as Browser);
      const locator = "//android.widget.TextView";

      const error = await driver
        .probe(TestTreeFactory.tree({ type: "android.widget.TextView" }), 1)
        .catch((value: unknown) => value);
      expect(error).toBeInstanceOf(TreeDevDrillError);
      expect(error).toMatchObject({ stage: "probe", external: locator });
    });
  });

  describe("pressKey", () => {
    it("presses supported keys via performActions", async () => {
      const performActions = vi.fn(async () => undefined);
      const getAppiumContext = vi.fn(async () => "NATIVE_APP");
      const webdriver = {
        capabilities: { platformName: "android" },
        performActions,
        getAppiumContext,
      };
      const driver = new AppiumDriver(webdriver as unknown as Browser);

      await driver.pressKey("Enter");
      expect(performActions).toHaveBeenCalledWith([
        {
          type: "key",
          id: "keyboard",
          actions: [
            { type: "keyDown", value: expect.anything() },
            { type: "keyUp", value: expect.anything() },
          ],
        },
      ]);
    });

    it("throws an error when key is unsupported or undefined", async () => {
      const performActions = vi.fn();
      const getAppiumContext = vi.fn(async () => "NATIVE_APP");
      const webdriver = {
        capabilities: { platformName: "android" },
        performActions,
        getAppiumContext,
      };
      const driver = new AppiumDriver(webdriver as unknown as Browser);

      await expect(driver.pressKey("F5" as any)).rejects.toThrow(
        'Unsupported key: "F5". Supported keys are: Backspace, Enter, Escape, Tab',
      );
      await expect(driver.pressKey(undefined as any)).rejects.toThrow(
        'Unsupported key: "undefined". Supported keys are: Backspace, Enter, Escape, Tab',
      );
      expect(performActions).not.toHaveBeenCalled();
    });
  });
});

class TestAppiumDriver extends AppiumDriver {
  probe(tree: BaseAccessibilityTree, rawId: number): Promise<string> {
    return this.devDrillProbeTree(tree, rawId);
  }
}
