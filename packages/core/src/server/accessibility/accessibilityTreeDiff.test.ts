import { describe, expect, it } from "bun:test";
import * as path from "node:path";
import { AccessibilityTreeDiff } from "./accessibilityTreeDiff.ts";
import { ServerChromiumAccessibilityTree } from "./chromium.ts";

const ACCESSIBILITY_TREE_DIFF_1_PATH = path.resolve(
  import.meta.dir,
  "__fixtures__/accessibility_tree_diff_1.xml",
);
const ACCESSIBILITY_TREE_DIFF_2_PATH = path.resolve(
  import.meta.dir,
  "__fixtures__/accessibility_tree_diff_2.xml",
);

async function accessibilityTreeBefore(): Promise<string> {
  const xml = await Bun.file(ACCESSIBILITY_TREE_DIFF_1_PATH).text();
  const tree = new ServerChromiumAccessibilityTree(xml);

  // @ts-expect-error -- Python API parity is assumed for the in-progress conversion.
  return tree.toXml();
}

async function accessibilityTreeAfter(): Promise<string> {
  const xml = await Bun.file(ACCESSIBILITY_TREE_DIFF_2_PATH).text();
  const tree = new ServerChromiumAccessibilityTree(xml);

  // @ts-expect-error -- Python API parity is assumed for the in-progress conversion.
  return tree.toXml();
}

describe.todo(AccessibilityTreeDiff, () => {
  it("compute returns unified diff for different xml", () => {
    const diff = new AccessibilityTreeDiff(
      "<root><button id='1'>Click me</button></root>",
      "<root><button id='1'>Submit</button></root>",
    );

    expect(diff.compute()).toBe(
      `--- before
+++ after
@@ -1 +1 @@
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

  it("compute large diff", async () => {
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
@@ -0,0 +1 @@
+<root><button id='1'>Click me</button></root>`,
    );
  });

  it("compute shows full tree as deletion", () => {
    const xml = "<root><button id='1'>Click me</button></root>";
    const diff = new AccessibilityTreeDiff(xml, "");

    expect(diff.compute()).toBe(
      `--- before
+++ after
@@ -1 +0,0 @@
-<root><button id='1'>Click me</button></root>`,
    );
  });
});
