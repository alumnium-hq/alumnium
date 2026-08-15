import { describe, expect, it, vi } from "vitest";
import type { Browser } from "webdriverio";
import type { AccessibilityElement } from "../accessibility/AccessibilityElement.ts";
import { BaseAccessibilityTree } from "../accessibility/BaseAccessibilityTree.ts";
import { AppiumDriver } from "./AppiumDriver.ts";

describe("AppiumDriver", () => {
  describe("findElement", () => {
    it("keeps the single-element query for a unique iOS predicate", async () => {
      const nativeElement = createNativeElement("unique");
      const { browser, driver } = createDriver(
        {
          id: 2,
          type: "XCUIElementTypeButton",
          name: "Continue",
          index: 0,
          matchCount: 1,
        },
        [],
        nativeElement,
      );

      await expect(driver.findElement(2)).resolves.toBe(nativeElement);
      expect(browser.$).toHaveBeenCalledOnce();
      expect(browser.$$).not.toHaveBeenCalled();
    });

    it("selects the recorded occurrence for duplicate iOS predicates", async () => {
      const firstElement = createNativeElement("first");
      const secondElement = createNativeElement("second");
      const { browser, driver } = createDriver(
        {
          id: 3,
          type: "XCUIElementTypeButton",
          name: "Action",
          index: 1,
          matchCount: 2,
        },
        [firstElement, secondElement],
      );

      await expect(driver.findElement(3)).resolves.toBe(secondElement);
      expect(browser.$$).toHaveBeenCalledWith(
        '-ios predicate string:type == "XCUIElementTypeButton" AND name == "Action"',
      );
      expect(browser.$).not.toHaveBeenCalled();
    });

    it("fails when Appium returns fewer duplicates than the tree", async () => {
      const { driver } = createDriver(
        {
          id: 4,
          type: "XCUIElementTypeButton",
          name: "Action",
          index: 2,
          matchCount: 3,
        },
        [createNativeElement("first"), createNativeElement("second")],
      );

      await expect(driver.findElement(4)).rejects.toThrow(
        'occurrence 2 for type == "XCUIElementTypeButton" AND name == "Action"; Appium returned 2 matches',
      );
    });
  });
});

function createDriver(
  accessibilityElement: AccessibilityElement,
  duplicateElements: WebdriverIO.Element[],
  uniqueElement = createNativeElement("unique"),
) {
  const browser = {
    capabilities: { platformName: "iOS" },
    $: vi.fn(() => ({ getElement: () => uniqueElement })),
    $$: vi.fn(async () =>
      duplicateElements.map((element) => ({ getElement: () => element })),
    ),
  };
  const driver = new AppiumDriver(browser as unknown as Browser);
  driver.setAccessibilityTree(new StubAccessibilityTree(accessibilityElement));
  return { browser, driver };
}

function createNativeElement(elementId: string): WebdriverIO.Element {
  return { elementId } as WebdriverIO.Element;
}

class StubAccessibilityTree extends BaseAccessibilityTree {
  #element: AccessibilityElement;

  constructor(element: AccessibilityElement) {
    super();
    this.#element = element;
  }

  toStr(): string {
    return "<XCUIElementTypeApplication/>";
  }

  elementById(): AccessibilityElement {
    return this.#element;
  }

  scopeToArea(): BaseAccessibilityTree {
    return this;
  }
}
