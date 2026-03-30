import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { XCUITestAccessibilityTree } from "./XCUITestAccessibilityTree.js";

const SIMPLE_FIXTURE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "__fixtures__/simple_xcuitest_accessibility_tree.xml",
);

describe("XCUITestAccessibilityTree", () => {
  describe("elementById", () => {
    it("returns correct element for given ID", async () => {
      const xml = await fs.readFile(SIMPLE_FIXTURE_PATH, "utf-8");
      const tree = new XCUITestAccessibilityTree(xml);
      expect(tree.elementById(74)).toMatchObject({
        id: 74,
        name: "Continue",
        type: "XCUIElementTypeButton",
      });
    });
  });
});
