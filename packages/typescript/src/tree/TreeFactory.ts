import type { Driver } from "../drivers/Driver.ts";
import type { BaseServerAccessibilityTree } from "../server/accessibility/BaseServerAccessibilityTree.ts";
import { ServerChromiumAccessibilityTree } from "../server/accessibility/ServerChromiumAccessibilityTree.ts";
import { ServerMaestroAccessibilityTree } from "../server/accessibility/ServerMaestroAccessibilityTree.ts";
import { ServerUIAutomator2AccessibilityTree } from "../server/accessibility/ServerUIAutomator2AccessibilityTree.ts";
import { ServerXCUITestAccessibilityTree } from "../server/accessibility/ServerXCUITestAccessibilityTree.ts";

export namespace TreeFactory {
  export type Kind = (typeof TreeFactory.kinds)[number];
}

export abstract class TreeFactory {
  static kinds = ["chromium", "xcuitest", "uiautomator2", "maestro"] as const;

  static kindFor(
    platform: Driver.Platform,
    driver: Driver.Kind,
  ): TreeFactory.Kind {
    switch (platform) {
      case "chromium":
        return "chromium";

      case "ios":
      case "android":
        if (driver === "maestro") return "maestro";
        return platform === "ios" ? "xcuitest" : "uiautomator2";
    }
  }

  static create(
    platform: Driver.Platform,
    driver: Driver.Kind,
    xml: string,
  ): BaseServerAccessibilityTree {
    switch (this.kindFor(platform, driver)) {
      case "chromium":
        return new ServerChromiumAccessibilityTree(xml);

      case "maestro":
        return new ServerMaestroAccessibilityTree(xml);

      case "uiautomator2":
        return new ServerUIAutomator2AccessibilityTree(xml);

      case "xcuitest":
        return new ServerXCUITestAccessibilityTree(xml);
    }
  }
}
