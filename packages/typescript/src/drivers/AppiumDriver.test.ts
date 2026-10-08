import type { Browser } from "webdriverio";
import { describe, expect, it, vi } from "vitest";
import type { BaseAccessibilityTree } from "../accessibility/BaseAccessibilityTree.ts";
import { TreeDevDrillError } from "../tree/dev/TreeDevDrillError.ts";
import { AppiumDriver } from "./AppiumDriver.ts";
import { TestTreeFactory } from "./__factories__/TestTreeFactory.ts";

describe("AppiumDriver", () => {
  describe("findElement", () => {
    const element = { type: "XCUIElementTypeButton", name: "Action" };
    const locator =
      '-ios predicate string:type == "XCUIElementTypeButton" AND name == "Action"';

    function createDriver(elements: WebdriverIO.Element[]) {
      const webdriver = {
        capabilities: { platformName: "iOS" },
        $: vi.fn(() => ({ getElement: async () => elements[0] })),
        $$: vi.fn(() => ({ getElements: async () => elements })),
      };
      const driver = new AppiumDriver(webdriver as unknown as Browser);
      return { webdriver, driver };
    }

    function nativeElement(elementId: string): WebdriverIO.Element {
      return { elementId } as WebdriverIO.Element;
    }

    it("finds a single element when index is 0", async () => {
      const first = nativeElement("first");
      const { webdriver, driver } = createDriver([first]);
      driver.setAccessibilityTree(
        TestTreeFactory.tree({ ...element, index: 0 }),
      );

      await expect(driver.findElement(1)).resolves.toBe(first);
      expect(webdriver.$).toHaveBeenCalledWith(locator);
      expect(webdriver.$$).not.toHaveBeenCalled();
    });

    it("picks the element at index among predicate matches", async () => {
      const second = nativeElement("second");
      const { webdriver, driver } = createDriver([
        nativeElement("first"),
        second,
      ]);
      driver.setAccessibilityTree(
        TestTreeFactory.tree({ ...element, index: 1 }),
      );

      await expect(driver.findElement(1)).resolves.toBe(second);
      expect(webdriver.$$).toHaveBeenCalledWith(locator);
      expect(webdriver.$).not.toHaveBeenCalled();
    });

    it("fails when index is out of predicate matches", async () => {
      const { driver } = createDriver([
        nativeElement("first"),
        nativeElement("second"),
      ]);
      driver.setAccessibilityTree(
        TestTreeFactory.tree({ ...element, index: 2 }),
      );

      await expect(driver.findElement(1)).rejects.toThrow(
        `No element found by locator: ${locator} at index 2, found 2 elements`,
      );
    });
  });

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
});

class TestAppiumDriver extends AppiumDriver {
  probe(tree: BaseAccessibilityTree, rawId: number): Promise<string> {
    return this.devDrillProbeTree(tree, rawId);
  }
}
