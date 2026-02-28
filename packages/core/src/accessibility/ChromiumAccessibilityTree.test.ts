import { describe, expect, it } from "bun:test";
import path from "node:path";
import { ChromiumAccessibilityTree } from "./ChromiumAccessibilityTree.js";

const FIXTURE_PATH = path.resolve(
  import.meta.dir,
  "__fixtures__/chromium_accessibility_tree.json",
);

describe(ChromiumAccessibilityTree, () => {
  describe(ChromiumAccessibilityTree.prototype.elementById, () => {
    it("returns correct element for given ID", async () => {
      const json = await Bun.file(FIXTURE_PATH).json();
      const tree = new ChromiumAccessibilityTree(json);
      expect(tree.elementById(1).backendNodeId).toBe(7);
      expect(tree.elementById(2).backendNodeId).toBe(6);
      expect(tree.elementById(3).backendNodeId).toBe(5);
    });
  });
});
