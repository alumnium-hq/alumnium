import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AccessibilityTreeDiff } from "./AccessibilityTreeDiff.js";
import { ServerChromiumAccessibilityTree } from "./ServerChromiumAccessibilityTree.js";

const ACCESSIBILITY_TREE_DIFF_1_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "./__fixtures__/accessibility_tree_diff_1.xml",
);
const ACCESSIBILITY_TREE_DIFF_2_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "./__fixtures__/accessibility_tree_diff_2.xml",
);

async function accessibilityTreeBefore(): Promise<string> {
  const xml = await fs.readFile(ACCESSIBILITY_TREE_DIFF_1_PATH, "utf-8");
  const tree = new ServerChromiumAccessibilityTree(xml);

  return tree.toXml();
}

async function accessibilityTreeAfter(): Promise<string> {
  const xml = await fs.readFile(ACCESSIBILITY_TREE_DIFF_2_PATH, "utf-8");
  const tree = new ServerChromiumAccessibilityTree(xml);

  return tree.toXml();
}

describe(AccessibilityTreeDiff, () => {
  it("compute returns unified diff for different xml", () => {
    const diff = new AccessibilityTreeDiff(
      "<root><button id='1'>Click me</button></root>",
      "<root><button id='1'>Submit</button></root>",
    );

    expect(diff.compute()).toBe(
      `--- before
+++ after
@@ -1,1 +1,1 @@
-<root><button id='1'>Click me</button></root>
+<root><button id='1'>Submit</button></root>`,
    );
  });

  it("compute returns empty string for identical xml", () => {
    const xml = "<root><button id='1'>Click me</button></root>";
    const diff = new AccessibilityTreeDiff(xml, xml);

    expect(diff.compute()).toBe("");
  });

  it("compute handles multiline xml", () => {
    const diff = new AccessibilityTreeDiff(
      `<root>
  <button id='1'>Click me</button>
  <input id='2' />
</root>`,
      `<root>
  <button id='1'>Submit</button>
  <input id='2' />
</root>`,
    );

    expect(diff.compute()).toBe(
      `--- before
+++ after
@@ -1,4 +1,4 @@
 <root>
-  <button id='1'>Click me</button>
+  <button id='1'>Submit</button>
   <input id='2' />
 </root>`,
    );
  });

  it.todo("compute large diff", async () => {
    const diff = new AccessibilityTreeDiff(
      await accessibilityTreeBefore(),
      await accessibilityTreeAfter(),
    );

    expect(diff.compute()).not.toBe("");
  });

  it("compute shows full tree as addition", () => {
    const xml = "<root><button id='1'>Click me</button></root>";
    const diff = new AccessibilityTreeDiff("", xml);

    expect(diff.compute()).toBe(
      `--- before
+++ after
@@ -0,0 +1,1 @@
+<root><button id='1'>Click me</button></root>`,
    );
  });

  it("compute shows full tree as deletion", () => {
    const xml = "<root><button id='1'>Click me</button></root>";
    const diff = new AccessibilityTreeDiff(xml, "");

    expect(diff.compute()).toBe(
      `--- before
+++ after
@@ -1,1 +0,0 @@
-<root><button id='1'>Click me</button></root>`,
    );
  });
});
