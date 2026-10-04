import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { ServerXcodeAccessibilityTree } from "../server/accessibility/ServerXcodeAccessibilityTree.ts";
import { XcodeAccessibilityTree } from "./XcodeAccessibilityTree.ts";

describe(XcodeAccessibilityTree, () => {
  for (const name of [
    "todo-list",
    "todo-editor",
    "todo-ios27-empty",
    "todo-ios27-focused",
    "todo-ios27-populated",
    "todo-ios27-editing",
  ]) {
    it(`renders the ${name} hierarchy as XML`, async () => {
      const tree = await fixture(name);
      expect(tree.toStr()).toMatchSnapshot();
      expect(
        new ServerXcodeAccessibilityTree(tree.toStr()).toXml(),
      ).toMatchSnapshot();
      expect(tree.toStr()).toBe(tree.toStr());
    });
  }

  it("keeps hit points and frames available for targeting", async () => {
    const tree = await fixture("todo-list");
    expect(tree.elementById(5)).toMatchObject({
      type: "Button",
      identifier: "add-task",
      label: "Add Task",
      hitPoint: { x: 360, y: 85 },
      frame: { x: 340, y: 65, width: 40, height: 40 },
      activationBundleId: "com.ayodeji.TodoList",
    });
    expect(tree.toStr()).not.toContain("hitPoint");
    expect(tree.toStr()).not.toContain("pid");
  });

  it("preserves raw IDs when scoped to a subtree", async () => {
    const tree = await fixture("todo-list");
    const scoped = tree.scopeToArea(7);
    expect(scoped.toStr()).toMatchSnapshot();
    expect(scoped.elementById(8)).toBe(tree.elementById(8));
    expect(() => scoped.elementById(5)).toThrow("No element");
    expect(tree.scopeToArea(1000)).toBe(tree);
  });

  it("resolves by identifier after an element moves and IDs change", async () => {
    const tree = await fixture("todo-list");
    const source = await readFixture("todo-list");
    const fresh = new XcodeAccessibilityTree(
      source
        .replace(
          "      Button,",
          "      Button, label: 'Cancel', hitPoint: {10, 10}\n      Button,",
        )
        .replace("{360.0, 85.0}", "{300.0, 90.0}"),
    );
    expect(fresh.resolve(tree.elementById(5))).toMatchObject({
      id: 6,
      identifier: "add-task",
      hitPoint: { x: 300, y: 90 },
    });
  });

  it("uses ancestor identity to distinguish repeated labels", async () => {
    const tree = await fixture("todo-list");
    const source = (await readFixture("todo-list")).replace(
      "identifier: 'milk-completed', ",
      "",
    );
    const fresh = new XcodeAccessibilityTree(source);
    expect(
      fresh.resolve(new XcodeAccessibilityTree(source).elementById(8)).parent
        ?.label,
    ).toBe("Buy milk");
    expect(() =>
      tree.resolve({ ...tree.elementById(5), identifier: "missing" }),
    ).toThrow("no longer present");
  });

  it("rejects indistinguishable controls instead of falling back to an index", () => {
    const tree = new XcodeAccessibilityTree(
      "Application, label: 'Todo'\n  Button, label: 'Edit'\n  Button, label: 'Edit'",
    );
    expect(() => tree.resolve(tree.elementById(2))).toThrow("ambiguous");
  });

  it("resolves duplicated remove icons by row text after rows move", async () => {
    const tree = await fixture("todo-ios27-editing");
    const source = await readFixture("todo-ios27-editing");
    const fresh = new XcodeAccessibilityTree(
      source
        .replace(/label: '(Buy milk|Buy bread)'/g, (_match, title) =>
          title === "Buy milk" ? "label: 'Buy bread'" : "label: 'Buy milk'",
        )
        .replaceAll("{44.0, 211.5}", "{80.0, 300.0}"),
    );
    // The second row now holds milk; neither the old ID nor coordinates identify it.
    for (const id of [36, 38]) {
      expect(fresh.resolve(tree.elementById(id))).toMatchObject({
        id: 50,
        hitPoint: { x: 44, y: 289.8 },
      });
    }
  });

  it("rejects repeated controls at different points within the same row", () => {
    const tree = new XcodeAccessibilityTree(
      "Application, label: 'Todo'\n Cell\n  StaticText, label: 'Buy milk'\n  Button, label: 'Delete', hitPoint: {20, 30}\n  Button, label: 'Delete', hitPoint: {40, 30}",
    );
    expect(() => tree.resolve(tree.elementById(4))).toThrow("ambiguous");
  });

  it("rejects controls in rows with identical titles", async () => {
    const source = (await readFixture("todo-ios27-editing")).replace(
      "Buy bread",
      "Buy milk",
    );
    const tree = new XcodeAccessibilityTree(source);
    expect(() => tree.resolve(tree.elementById(36))).toThrow("ambiguous");
  });

  it("handles overlapping applications and activation annotations", () => {
    const tree = new XcodeAccessibilityTree(
      "Application bundle identifier: com.todo\nApplication, label: 'Todo'\n  Button, label: 'Allow', activationBundleId: com.apple.springboard\nApplication bundle identifier: com.other\nApplication, label: 'Other'\n  Button, label: 'Allow'",
    );
    expect(tree.elementById(2).activationBundleId).toBe(
      "com.apple.springboard",
    );
    expect(tree.elementById(4).activationBundleId).toBe("com.other");
    expect(tree.resolve(tree.elementById(4)).id).toBe(4);
  });

  it("reports an empty or unavailable hierarchy", () => {
    expect(
      () =>
        new XcodeAccessibilityTree(
          "Device orientation: Portrait\nApplication is not responding",
        ),
    ).toThrow("no application");
  });

  it("parses XCTest's unquoted values, apostrophes, and control flags", () => {
    const tree = new XcodeAccessibilityTree(
      "Application, 0xabc, pid: 123, label: 'Todo'\n  TextField, 0xdef, {{0, 0}, {100, 40}}, identifier: 'title', label: 'Alice's task', value: Buy milk, Focused, hitPoint: {50, 20}\n  Button, 0x123, label: 'Save', Disabled\n  Switch, value: 0, Selected, hitPoint: {20, 20}",
    );
    expect(tree.elementById(2)).toMatchObject({
      label: "Alice's task",
      value: "Buy milk",
      attributes: { focused: "true" },
    });
    expect(tree.elementById(3).attributes["enabled"]).toBe("false");
    expect(tree.elementById(4).attributes["selected"]).toBe("true");
  });

  it("separates keyboard focus from a text field's value in a live iOS 27 tree", async () => {
    const tree = await fixture("todo-ios27-focused");
    expect(tree.elementById(20)).toMatchObject({
      type: "TextField",
      value: "Buy milk",
      attributes: { focused: "true" },
    });
    const unfocused = new XcodeAccessibilityTree(
      (await readFixture("todo-ios27-focused")).replace(
        ", Keyboard Focused",
        "",
      ),
    );
    expect(tree.resolve(unfocused.elementById(20)).id).toBe(20);
  });

  it("keeps every overlapping application's elements addressable on the server", () => {
    const tree = new XcodeAccessibilityTree(
      "Application bundle identifier: com.todo\nApplication, label: 'Todo'\n  Button, label: 'Add'\nApplication bundle identifier: com.other\nApplication, label: 'Other'\n  Button, label: 'Allow'",
    );
    const server = new ServerXcodeAccessibilityTree(tree.toStr());
    expect(server.toXml()).toContain('name="Allow"');
    expect(
      server.mapToolCallsToRawId([{ name: "ClickTool", args: { id: 4 } }])[0]
        ?.args.id,
    ).toBe(4);
  });
});

function readFixture(name: string): Promise<string> {
  return readFile(
    new URL(`./__fixtures__/xcode-${name}.txt`, import.meta.url),
    "utf-8",
  );
}

async function fixture(name: string): Promise<XcodeAccessibilityTree> {
  return new XcodeAccessibilityTree(await readFixture(name));
}
