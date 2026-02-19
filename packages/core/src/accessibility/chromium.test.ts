import { describe, expect, it } from "bun:test";
import * as path from "node:path";
import { ChromiumAccessibilityTree } from "./chromium.ts";

const FIXTURE_PATH = path.resolve(
  import.meta.dir,
  "__fixtures__/chromium_accessibility_tree.json",
);

describe.todo(ChromiumAccessibilityTree, () => {
  describe(ChromiumAccessibilityTree.prototype.elementById, () => {
    it("returns correct element for given ID", async () => {
      const json = await Bun.file(FIXTURE_PATH).text();
      const tree = new ChromiumAccessibilityTree(json);
      expect(tree.elementById(1).backend_node_id).toBe(7);
      expect(tree.elementById(2).backend_node_id).toBe(6);
      expect(tree.elementById(3).backend_node_id).toBe(5);
    });
  });
});
