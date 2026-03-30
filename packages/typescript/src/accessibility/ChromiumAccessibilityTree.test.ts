import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ChromiumAccessibilityTree } from "./ChromiumAccessibilityTree.js";

const FIXTURE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "__fixtures__/chromium_accessibility_tree.json",
);

describe("ChromiumAccessibilityTree", () => {
  describe("elementById", () => {
    it("returns correct element for given ID", async () => {
      const json = await fs.readFile(FIXTURE_PATH, "utf-8").then(JSON.parse);
      const tree = new ChromiumAccessibilityTree(json);
      expect(tree.elementById(1).backendNodeId).toBe(7);
      expect(tree.elementById(2).backendNodeId).toBe(6);
      expect(tree.elementById(3).backendNodeId).toBe(5);
    });
  });
});
