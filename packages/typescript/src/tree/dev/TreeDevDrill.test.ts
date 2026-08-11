import { describe, expect, it, vi } from "vitest";
import { BaseAccessibilityTree } from "../../accessibility/BaseAccessibilityTree.ts";
import type { AccessibilityElement } from "../../accessibility/AccessibilityElement.ts";
import type { BaseServerAccessibilityTree } from "../../server/accessibility/BaseServerAccessibilityTree.ts";
import { TreeFactory } from "../TreeFactory.ts";
import { TreeDevDrill } from "./TreeDevDrill.ts";
import { TreeDevDrillError } from "./TreeDevDrillError.ts";

describe(TreeDevDrill, () => {
  it("walks multiple roots and nested tags in output order", async () => {
    mockOutput(
      '<one id="2"><ignored><two id="7">text</two></ignored></one><three id="11">x</three>',
    );
    const probe = vi.fn(async (_tree: BaseAccessibilityTree, rawId: number) =>
      Promise.resolve(rawId),
    );
    const drill = await TreeDevDrill.run({
      action: "click",
      platform: "chromium",
      tree: new TestTree("input"),
      probe,
    });

    expect(probe.mock.calls.map((call) => call[1])).toEqual([2, 7, 11]);
    expect(drill.result.failures).toEqual([]);
  });

  it("records malformed IDs, including unrecoverable compact self-closing artifacts", async () => {
    mockOutput('<LineBreak id=13/><button id="bad"/><input id="0"/>');
    const probe = vi.fn(async () => 13);
    const drill = await TreeDevDrill.run({
      action: "type",
      platform: "chromium",
      tree: new TestTree("input"),
      probe,
    });

    expect(probe).not.toHaveBeenCalled();
    expect(drill.result.failures.map((failure) => failure.stage)).toEqual([
      "parse",
      "parse",
      "parse",
    ]);
    expect(drill.result.failures.map((failure) => failure.ids.parsed)).toEqual([
      "13/",
      "bad",
      "0",
    ]);
  });

  it("ignores output without IDs", async () => {
    mockOutput("text<root><child/></root>");
    const probe = vi.fn(async () => 1);
    const drill = await TreeDevDrill.run({
      action: "wait",
      platform: "chromium",
      tree: new TestTree("input"),
      probe,
    });

    expect(drill.tested).toBe(0);
    expect(probe).not.toHaveBeenCalled();
    expect(drill.result.failures).toEqual([]);
  });

  it("maps only final IDs and continues probing after failures", async () => {
    const tree = new TestTree(
      '<RootWebArea raw_id="1" backendDOMNodeId="10"><button raw_id="2" backendDOMNodeId="20" name="Go"/><button raw_id="3" backendDOMNodeId="30" name="Stop"/></RootWebArea>',
    );
    const probed: number[] = [];
    const probe = vi.fn(async (_tree: BaseAccessibilityTree, rawId: number) => {
      probed.push(rawId);
      if (rawId === 2) {
        throw new TreeDevDrillError(
          "probe",
          new Error("Node is not an Element"),
          20,
        );
      }
      return rawId * 10;
    });

    const drill = await TreeDevDrill.run({
      action: "click",
      platform: "chromium",
      tree,
      probe,
    });

    expect(probed).toEqual([1, 2, 3]);
    expect(drill.tested).toBe(3);
    expect(drill.result.failures).toContainEqual({
      action: "click",
      stage: "probe",
      role: "button",
      ids: { parsed: "2", simplified: 2, raw: 2, external: 20 },
      error: "Node is not an Element",
    });
  });

  it("records duplicate IDs without probing twice", async () => {
    mockOutput('<button id="1">one</button><link id="1">two</link>');
    const probe = vi.fn(async () => 1);
    const drill = await TreeDevDrill.run({
      action: "click",
      platform: "chromium",
      tree: new TestTree("input"),
      probe,
    });

    expect(probe).toHaveBeenCalledOnce();
    expect(drill.result.failures).toContainEqual({
      action: "click",
      stage: "parse",
      role: "link",
      ids: { parsed: "1", simplified: 1 },
      error: "Duplicate rendered id=1",
    });
  });

  it("records missing simplified-to-raw mappings", async () => {
    const tree = new TestTree('<RootWebArea name="Root"/>');
    const probe = vi.fn(async () => 1);
    const drill = await TreeDevDrill.run({
      action: "wait",
      platform: "chromium",
      tree,
      probe,
    });

    expect(probe).not.toHaveBeenCalled();
    expect(
      drill.result.failures.some((failure) => failure.stage === "map"),
    ).toBe(true);
  });
});

class TestTree extends BaseAccessibilityTree {
  readonly xml: string;

  constructor(xml: string) {
    super();
    this.xml = xml;
  }

  toStr(): string {
    return this.xml;
  }

  elementById(id: number): AccessibilityElement {
    return { backendNodeId: id * 10 };
  }

  scopeToArea(): BaseAccessibilityTree {
    return this;
  }
}

function mockOutput(output: string): void {
  vi.spyOn(TreeFactory, "create").mockReturnValue({
    toXml: () => output,
    getRawId: (id: unknown) => Number(id),
  } as BaseServerAccessibilityTree);
}
