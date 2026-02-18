import { describe, expect, it } from "bun:test";
import * as path from "node:path";
import { XcuiTestAccessibilityTree } from "./xcuiTest.ts";

const SIMPLE_FIXTURE_PATH = path.resolve(
  import.meta.dir,
  "__fixtures__/simple_xcuitest_accessibility_tree.xml",
);

describe(XcuiTestAccessibilityTree, () => {
  describe(XcuiTestAccessibilityTree.prototype.elementById, () => {
    it("returns correct element for given ID", async () => {
      const xml = await Bun.file(SIMPLE_FIXTURE_PATH).text();
      const tree = new XcuiTestAccessibilityTree(xml);
      expect(tree.elementById(74)).toMatchObject({
        id: 74,
        name: "Continue",
        type: "XCUIElementTypeButton",
      });
    });
  });
});
