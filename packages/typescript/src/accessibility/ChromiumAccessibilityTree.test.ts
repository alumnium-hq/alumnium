import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ChromiumAccessibilityTree } from "./ChromiumAccessibilityTree.ts";

const FIXTURE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "__fixtures__/chromium_accessibility_tree.json",
);

describe("ChromiumAccessibilityTree", () => {
  it("serializes mutable metadata as one concise marker", () => {
    const tree = new ChromiumAccessibilityTree({
      nodes: [
        {
          nodeId: "1",
          backendDOMNodeId: 7,
          role: { value: "button" },
          _mutable: true,
        },
        {
          nodeId: "2",
          backendDOMNodeId: 8,
          role: { value: "StaticText" },
          _mutable: false,
        },
      ],
    });

    expect(tree.toStr()).toBe(
      '<button raw_id=1 backendDOMNodeId=7 nodeId=1 mutable /><StaticText raw_id=2 backendDOMNodeId=8 nodeId=2 mutable="no" />',
    );
  });

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
