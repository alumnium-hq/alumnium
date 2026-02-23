import { describe, expect, it } from "bun:test";
import * as path from "node:path";
import { UIAutomator2AccessibilityTree } from "./UIAutomator2AccessibilityTree.ts";

const FIXTURE_PATH = path.resolve(
  import.meta.dir,
  "__fixtures__/uiautomator2_accessibility_tree.xml",
);

describe.todo(UIAutomator2AccessibilityTree, () => {
  describe(UIAutomator2AccessibilityTree.prototype.elementById, () => {
    it("returns correct element for given ID", async () => {
      const xml = await Bun.file(FIXTURE_PATH).text();
      const tree = new UIAutomator2AccessibilityTree(xml);
      expect(tree.elementById(9)).toMatchObject({
        id: 9,
        name: "org.wikipedia.alpha:id/fragment_container",
        type: "android.widget.FrameLayout",
      });
    });
  });
});
