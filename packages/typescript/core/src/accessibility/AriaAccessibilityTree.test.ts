import { describe, expect, it } from "vitest";
import { todoAriaSnapshot } from "./__fixtures__/aria_snapshot.ts";
import { AriaAccessibilityTree } from "./AriaAccessibilityTree.ts";

describe(AriaAccessibilityTree, () => {
  it("renders the snapshot as XML with raw IDs and shared IDs", async () => {
    const tree = new AriaAccessibilityTree(todoAriaSnapshot);

    expect(await tree.toStr()).toMatchInlineSnapshot(`
      "<RootWebArea raw_id=1>
        <heading raw_id=2 sharedId="shared-1" name="todos" level=1 />
        <textbox raw_id=3 sharedId="shared-2" name="What needs to be done?" placeholder="What needs to be done?" />
        <list raw_id=4 sharedId="shared-3">
          <listitem raw_id=5 sharedId="shared-4">
            <checkbox raw_id=6 sharedId="shared-5" checked="false" />
            <text raw_id=7 name="buy milk" />
            <button raw_id=8 sharedId="shared-6" name="×" />
          </listitem>
        </list>
        <text raw_id=9 name="0 items left" />
      </RootWebArea>"
    `);
  });

  it("finds elements by raw ID", async () => {
    const tree = new AriaAccessibilityTree(todoAriaSnapshot);

    expect(await tree.elementById(8)).toEqual({
      type: "button",
      sharedId: "shared-6",
    });
  });

  it("fails to find elements without shared ID", async () => {
    const tree = new AriaAccessibilityTree(todoAriaSnapshot);

    await expect(tree.elementById(7)).rejects.toThrow(
      "Element with raw_id=7 has no sharedId attribute",
    );
    await expect(tree.elementById(100)).rejects.toThrow(
      "No element with raw_id=100 found",
    );
  });

  it("scopes to an area keeping raw IDs and shared IDs", async () => {
    const tree = new AriaAccessibilityTree(todoAriaSnapshot);
    const area = await tree.scopeToArea(5);

    expect(await area.toStr()).toMatchInlineSnapshot(`
      "<listitem raw_id=5 sharedId="shared-4">
        <checkbox raw_id=6 sharedId="shared-5" checked="false" />
        <text raw_id=7 name="buy milk" />
        <button raw_id=8 sharedId="shared-6" name="×" />
      </listitem>"
    `);
    expect(await area.elementById(6)).toEqual({
      type: "checkbox",
      sharedId: "shared-5",
    });
  });

  it("renders values the snapshot leaves out", async () => {
    const tree = new AriaAccessibilityTree({
      root: {
        role: "fragment",
        name: "",
        children: [
          { role: "button", name: "Choose File", ref: "e1", children: [] },
        ],
      },
      sharedIds: { e1: "shared-1" },
      values: { e1: "report.txt" },
    });

    expect(await tree.toStr()).toContain(
      '<button raw_id=2 sharedId="shared-1" name="Choose File" value="report.txt" />',
    );
  });
});
