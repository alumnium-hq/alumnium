import type { Driver } from "../drivers/Driver.ts";
import type { BaseServerAccessibilityTree } from "../server/accessibility/BaseServerAccessibilityTree.ts";
import { ServerChromiumAccessibilityTree } from "../server/accessibility/ServerChromiumAccessibilityTree.ts";
import { ServerUIAutomator2AccessibilityTree } from "../server/accessibility/ServerUIAutomator2AccessibilityTree.ts";
import { ServerXCUITestAccessibilityTree } from "../server/accessibility/ServerXCUITestAccessibilityTree.ts";

export abstract class TreeFactory {
  static create(
    platform: Driver.Platform,
    xml: string,
  ): BaseServerAccessibilityTree {
    switch (platform) {
      case "chromium":
        return new ServerChromiumAccessibilityTree(xml);

      case "uiautomator2":
        return new ServerUIAutomator2AccessibilityTree(xml);

      case "xcuitest":
        return new ServerXCUITestAccessibilityTree(xml);
    }
  }
}
