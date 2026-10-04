import { Element } from "domhandler";
import { z } from "zod";
import { XmlRenderer } from "../xml/XmlRenderer.ts";
import type { AccessibilityElement } from "./AccessibilityElement.ts";
import { BaseAccessibilityTree } from "./BaseAccessibilityTree.ts";

export namespace XcodeAccessibilityTree {
  export interface Point {
    x: number;
    y: number;
  }

  export interface Frame extends Point {
    width: number;
    height: number;
  }

  export interface Node extends AccessibilityElement {
    id: number;
    type: string;
    identifier?: string | undefined;
    hitPoint?: Point | undefined;
    frame?: Frame | undefined;
    activationBundleId: string;
    attributes: Record<string, string>;
    children: Node[];
    parent?: Node | undefined;
  }
}

/** Xcode's indented XCTest debug description, with geometry kept outside the model's XML. */
export class XcodeAccessibilityTree extends BaseAccessibilityTree<string> {
  readonly #roots: XcodeAccessibilityTree.Node[];
  readonly #nodes: XcodeAccessibilityTree.Node[];

  protected override get kind(): string {
    return "xcode";
  }

  constructor(source: string, roots?: XcodeAccessibilityTree.Node[]) {
    super(source);
    this.#roots = roots ?? parseHierarchy(source);
    this.#nodes = this.#roots.flatMap(flatten);
  }

  toStr(): string {
    return (this.xml ??= XmlRenderer.render(this.#roots.map(toXml), {
      compactAttrs: false,
    }));
  }

  elementById(id: number): XcodeAccessibilityTree.Node {
    const node = this.#nodes.find((candidate) => candidate.id === id);
    if (!node) throw new Error(`No element with raw_id=${id} found`);
    return node;
  }

  override scopeToArea(id: number): XcodeAccessibilityTree {
    const node = this.#nodes.find((candidate) => candidate.id === id);
    return node ? new XcodeAccessibilityTree(this.toStr(), [node]) : this;
  }

  /** Resolve a previous target in a fresh capture, ignoring IDs, values, and coordinates. */
  resolve(target: XcodeAccessibilityTree.Node): XcodeAccessibilityTree.Node {
    let matches = this.#nodes.filter((candidate) =>
      sameIdentity(candidate, target),
    );
    if (!target.identifier || matches.length > 1) {
      const context = ancestorIdentity(target);
      matches = matches.filter(
        (candidate) => ancestorIdentity(candidate) === context,
      );
    }

    // XCTest can expose the same control twice through separate wrapper views.
    const first = matches[0];
    if (
      first?.hitPoint &&
      matches.every(
        (candidate) => actionIdentity(candidate) === actionIdentity(first),
      )
    ) {
      return first;
    }

    if (matches.length !== 1) {
      throw new Error(
        `Xcode element ${target.identifier || target.label || target.type} is ${matches.length ? "ambiguous" : "no longer present"}; fetch a fresh accessibility tree`,
      );
    }

    return matches[0]!;
  }

  find(
    predicate: (node: XcodeAccessibilityTree.Node) => boolean,
  ): XcodeAccessibilityTree.Node | undefined {
    return this.#nodes.find(predicate);
  }
}

const NUMBER = "(-?\\d+(?:\\.\\d+)?)";
const FRAME = new RegExp(
  `\\{\\{${NUMBER},\\s*${NUMBER}\\},\\s*\\{${NUMBER},\\s*${NUMBER}\\}\\}`,
);
const HIT_POINT = new RegExp(`hitPoint:\\s*\\{${NUMBER},\\s*${NUMBER}\\}`);
const QUOTED_ATTRIBUTE =
  /(?:^|,\s*)(identifier|label|value|title|placeholderValue):\s*'((?:\\.|[^']|'(?!,\s|$))*)'(?=,\s|$)/g;
const BOOLEAN_ATTRIBUTE =
  /(?:^|,\s*)(enabled|selected|focused|isEnabled|isSelected|isFocused|isRemoteLeafPlaceholder):\s*(true|false|YES|NO|0|1)(?=,\s|$)/g;
const POINT = z.tuple([z.coerce.number().finite(), z.coerce.number().finite()]);
const RECT = z.tuple([
  z.coerce.number().finite(),
  z.coerce.number().finite(),
  z.coerce.number().finite(),
  z.coerce.number().finite(),
]);

function parseHierarchy(source: string): XcodeAccessibilityTree.Node[] {
  const roots: XcodeAccessibilityTree.Node[] = [];
  const stack: { indent: number; node: XcodeAccessibilityTree.Node }[] = [];
  let bundleId = "";
  let id = 0;
  for (const line of source.split(/\r?\n/)) {
    const application = /^Application bundle identifier:\s*(.+)$/.exec(line);
    if (application) {
      bundleId = application[1]!.trim();
      stack.length = 0;
      continue;
    }
    const match = /^(\s*)([A-Z][A-Za-z0-9]*)(?=,|\s|$)(.*)$/.exec(line);
    if (
      !match ||
      /^(Device|Application UI|Application pid|Application is)/.test(line)
    )
      continue;
    const [, whitespace, type, description] = match;
    if (type !== "Application" && !stack.length) continue;
    const attributes: Record<string, string> = {};
    for (const attr of description!.matchAll(QUOTED_ATTRIBUTE)) {
      attributes[attr[1]!] = attr[2]!.replace(/\\(['\\])/g, "$1");
    }
    // XCTest quotes labels/identifiers, but usually emits values without quotes.
    const value =
      /(?:^|,\s*)value:\s*(.*?)(?=,\s*(?:(?:hitPoint|activationBundleId|enabled|selected|focused|is\w+):|(?:Disabled|Selected|Focused|Keyboard Focused)(?:,|$))|$)/.exec(
        description!,
      );
    if (value && attributes["value"] === undefined)
      attributes["value"] = value[1]!.trim();
    for (const attr of description!.matchAll(BOOLEAN_ATTRIBUTE)) {
      const name = attr[1]!.replace(/^is(?=[A-Z])/, "");
      const normalized = name[0]!.toLowerCase() + name.slice(1);
      attributes[normalized] = ["true", "YES", "1"].includes(attr[2]!)
        ? "true"
        : "false";
    }
    for (const [flag, attr] of [
      ["Disabled", "enabled"],
      ["Selected", "selected"],
      ["Focused", "focused"],
      ["Keyboard Focused", "focused"],
    ]) {
      if (new RegExp(`(?:^|,\\s*)${flag}(?=,|$)`).test(description!))
        attributes[attr!] = flag === "Disabled" ? "false" : "true";
    }
    const frameMatch = FRAME.exec(description!);
    const hitMatch = HIT_POINT.exec(description!);
    const frame = frameMatch
      ? RECT.parse(frameMatch.slice(1).map(Number))
      : undefined;
    const hitPoint = hitMatch
      ? POINT.parse(hitMatch.slice(1).map(Number))
      : undefined;
    const indent = whitespace!.length;
    while (stack.length && stack.at(-1)!.indent >= indent) stack.pop();
    const parent = stack.at(-1)?.node;
    const node: XcodeAccessibilityTree.Node = {
      id: ++id,
      type: type!,
      identifier: attributes["identifier"],
      name: attributes["identifier"] || attributes["label"],
      label: attributes["label"],
      value: attributes["value"],
      frame: frame && {
        x: frame[0],
        y: frame[1],
        width: frame[2],
        height: frame[3],
      },
      hitPoint: hitPoint && { x: hitPoint[0], y: hitPoint[1] },
      activationBundleId:
        /activationBundleId:\s*([^,\s]+)/.exec(description!)?.[1] ?? bundleId,
      attributes,
      children: [],
      parent,
    };
    (parent?.children ?? roots).push(node);
    stack.push({ indent, node });
  }
  if (!roots.length)
    throw new Error(
      "Xcode returned no application accessibility hierarchy; capture the device again",
    );
  return roots;
}

function flatten(
  node: XcodeAccessibilityTree.Node,
): XcodeAccessibilityTree.Node[] {
  return [node, ...node.children.flatMap(flatten)];
}

function toXml(node: XcodeAccessibilityTree.Node): Element {
  const attributes = {
    raw_id: String(node.id),
    name: node.name ?? "",
    ...node.attributes,
  };
  const element = new Element(node.type, attributes);
  element.children = node.children.map(toXml);
  for (const child of element.children) child.parent = element;
  return element;
}

function sameIdentity(
  candidate: XcodeAccessibilityTree.Node,
  target: XcodeAccessibilityTree.Node,
): boolean {
  return (
    candidate.type === target.type &&
    candidate.activationBundleId === target.activationBundleId &&
    (target.identifier
      ? candidate.identifier === target.identifier
      : candidate.label === target.label)
  );
}

function ancestorIdentity(node: XcodeAccessibilityTree.Node): string {
  const identities: string[] = [];
  for (let parent = node.parent; parent; parent = parent.parent) {
    identities.push(
      JSON.stringify([
        parent.type,
        parent.identifier || parent.label || "",
        // SwiftUI list cells often have no label; their text identifies the row.
        parent.type === "Cell"
          ? flatten(parent)
              .filter((child) => child.type === "StaticText")
              .map((child) => child.label ?? "")
              .sort()
          : [],
      ]),
    );
  }
  return identities.join("/");
}

function actionIdentity(node: XcodeAccessibilityTree.Node): string {
  return JSON.stringify([node.attributes, node.frame, node.hitPoint]);
}
