import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ServerXCUITestAccessibilityTree } from "../server/accessibility/ServerXCUITestAccessibilityTree.ts";
import { ElementsCacheTree } from "../server/cache/ElementsCache/ElementsCacheTree.ts";
import { XCUITestAccessibilityTree } from "./XCUITestAccessibilityTree.ts";

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

    it("tracks positions among elements with the same locator attributes", () => {
      const tree = duplicateElementsTree();

      expect(tree.elementById(2)).toMatchObject({ index: 0 });
      expect(tree.elementById(5)).toMatchObject({ index: 1 });
      expect(tree.elementById(7)).toMatchObject({ index: 2 });
    });
  });

  describe("scopeToArea", () => {
    it("preserves full-tree IDs and locator positions", () => {
      const tree = duplicateElementsTree();
      const area = tree.scopeToArea(4);

      expect(area.toStr()).toContain("raw_id=7");
      expect(area.elementById(7)).toMatchObject({ index: 2 });
    });

    it("resolves elements cached within area to full-tree predicate index", () => {
      const area = duplicateElementsTree().scopeToArea(4);
      const serverTree = new ServerXCUITestAccessibilityTree(area.toStr());
      const cacheTree = new ElementsCacheTree(serverTree.toXml());

      const cached = cacheTree.extractAttrs(4);
      expect(cached).toMatchObject({
        role: "Button",
        name: "Action",
        index: 1,
      });
      expect(cached).not.toHaveProperty("raw_id");

      const resolved = cacheTree.resolveElements([cached!]);
      const rawId = serverTree.getRawId(resolved![0]);
      expect(area.elementById(rawId)).toMatchObject({ id: 7, index: 2 });
    });
  });

  describe("scopeToArea", () => {
    it("returns the original tree when the element is not found", async () => {
      const xml = await fs.readFile(SIMPLE_FIXTURE_PATH, "utf-8");
      const tree = new XCUITestAccessibilityTree(xml);

      expect(tree.scopeToArea(99999).toStr()).toBe(tree.toStr());
    });
  });
});

function duplicateElementsTree(): XCUITestAccessibilityTree {
  return new XCUITestAccessibilityTree(`<XCUIElementTypeApplication>
    <XCUIElementTypeButton name="Action" label="Action">
      <XCUIElementTypeStaticText name="First"></XCUIElementTypeStaticText>
    </XCUIElementTypeButton>
    <XCUIElementTypeOther name="Area">
      <XCUIElementTypeButton name="Action" label="Action">
        <XCUIElementTypeStaticText name="Second"></XCUIElementTypeStaticText>
      </XCUIElementTypeButton>
      <XCUIElementTypeButton name="Action" label="Action">
        <XCUIElementTypeStaticText name="Third"></XCUIElementTypeStaticText>
      </XCUIElementTypeButton>
    </XCUIElementTypeOther>
  </XCUIElementTypeApplication>`);
}
