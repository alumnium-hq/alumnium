import { describe, expect, it } from "bun:test";
import path from "node:path";
import { XCUITestAccessibilityTree } from "./XCUITestAccessibilityTree.js";

const SIMPLE_FIXTURE_PATH = path.resolve(
  import.meta.dir,
  "__fixtures__/simple_xcuitest_accessibility_tree.xml",
);

describe("XCUITestAccessibilityTree", () => {
  describe("elementById", () => {
    it("returns correct element for given ID", async () => {
      const xml = await Bun.file(SIMPLE_FIXTURE_PATH).text();
      const tree = new XCUITestAccessibilityTree(xml);
      expect(tree.elementById(74)).toMatchObject({
        id: 74,
        name: "Continue",
        type: "XCUIElementTypeButton",
      });
    });
  });
});
