import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { UIAutomator2AccessibilityTree } from "./UIAutomator2AccessibilityTree.ts";

const FIXTURE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "__fixtures__/uiautomator2_accessibility_tree.xml",
);

describe("UIAutomator2AccessibilityTree", () => {
  describe("elementById", () => {
    it("returns correct element for given ID", async () => {
      const xml = await fs.readFile(FIXTURE_PATH, "utf-8");
      const tree = new UIAutomator2AccessibilityTree(xml);
      expect(tree.elementById(9)).toMatchObject({
        id: 9,
        androidResourceId: "org.wikipedia.alpha:id/fragment_container",
        type: "android.widget.FrameLayout",
      });
    });
  });
});
