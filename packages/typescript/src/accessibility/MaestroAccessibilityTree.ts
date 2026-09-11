import { Element } from "domhandler";
import type { MaestroSession } from "../drivers/MaestroSession.ts";
import { XmlRenderer } from "../xml/XmlRenderer.ts";
import type { AccessibilityElement } from "./AccessibilityElement.ts";
import { BaseAccessibilityTree } from "./BaseAccessibilityTree.ts";

/** Fallback legend, used when Maestro omits `ui_schema.abbreviations`. */
const DEFAULT_ABBREVIATIONS: Record<string, string> = {
  b: "bounds",
  txt: "text",
  rid: "resource-id",
  a11y: "accessibilityText",
  hint: "hintText",
  val: "value",
  c: "children",
};

/** Attributes rendered onto every node, in the order they should appear. */
const ATTR_ORDER = [
  "resource-id",
  "accessibilityText",
  "hintText",
  "text",
  "value",
  "checked",
  "selected",
  "focused",
  "enabled",
  "bounds",
] as const;

export namespace MaestroAccessibilityTree {
  /** Role names inferred from the attributes Maestro provides. */
  export type Role = "TextField" | "CheckBox" | "Text" | "View";
}

/**
 * Maestro's view hierarchy, rendered as XML with `raw_id` markers.
 *
 * Maestro normalizes iOS and Android into one flat shape of `{attributes, children}`, which means
 * it drops the platform element type — there is no `XCUIElementTypeButton` or
 * `android.widget.TextView` to key off. Roles are therefore inferred from the attributes that do
 * survive, and most nodes end up as the generic `View` that the server tree collapses away.
 */
export class MaestroAccessibilityTree extends BaseAccessibilityTree<MaestroSession.Hierarchy> {
  #hierarchy: MaestroSession.Hierarchy;
  #nextRawId: number = 0;
  #elementsByRawId: Map<number, AccessibilityElement> = new Map();
  /** Maestro's abbreviation legend, merged with the fallback. */
  #attrNames: Record<string, string>;
  /** The abbreviated key that holds child nodes, per the legend. */
  #childrenKey: string;
  #defaults: Record<string, unknown>;

  protected override get kind(): string {
    return "maestro";
  }

  constructor(hierarchy: MaestroSession.Hierarchy) {
    super(hierarchy);
    this.#hierarchy = hierarchy;
    this.#attrNames = {
      ...DEFAULT_ABBREVIATIONS,
      ...hierarchy.ui_schema?.abbreviations,
    };
    this.#childrenKey =
      Object.entries(this.#attrNames).find(
        ([, name]) => name === "children",
      )?.[0] ?? "children";
    this.#defaults = hierarchy.ui_schema?.defaults ?? {};
  }

  /** Renders the hierarchy as XML, stamping `raw_id` on every node. */
  toStr(): string {
    if (this.xml !== null) {
      return this.xml;
    }

    // Maestro returns a list of roots (the app window plus overlay layers such as the status
    // bar), so they get a synthetic parent the way the UIAutomator2 tree does.
    const root = new Element("root", {});
    root.children = this.#hierarchy.elements.map((node) =>
      this.#nodeToXml(node, root),
    );

    return (this.xml = XmlRenderer.render([root]));
  }

  #nodeToXml(node: MaestroSession.Node, parent: Element | null): Element {
    const attrs = this.#expand(node);
    const children = this.#childrenOf(node);
    const rawId = (this.#nextRawId += 1);
    const role = this.#inferRole(attrs, children.length);

    const xmlAttrs: Record<string, string> = { raw_id: String(rawId) };
    for (const name of ATTR_ORDER) {
      const value = attrs[name];
      if (value !== undefined && value !== "") xmlAttrs[name] = value;
    }

    const element = new Element(role, xmlAttrs);
    element.parent = parent;
    element.children = children.map((child) => this.#nodeToXml(child, element));

    this.#elementsByRawId.set(rawId, {
      id: rawId,
      type: role,
      name: attrs["accessibilityText"],
      label: attrs["accessibilityText"],
      value: attrs["text"] ?? attrs["value"],
      maestroBounds: attrs["bounds"],
    });

    return element;
  }

  /**
   * Expands Maestro's abbreviated keys into full attribute names, dropping values that match
   * `ui_schema.defaults` since those carry no information.
   */
  #expand(node: MaestroSession.Node): Record<string, string> {
    const attrs: Record<string, string> = {};
    for (const [key, value] of Object.entries(node)) {
      const name = this.#attrNames[key] ?? key;
      if (name === "children") continue;
      if (value === null || value === undefined) continue;
      if (key in this.#defaults && this.#defaults[key] === value) continue;
      attrs[name] = String(value);
    }
    return attrs;
  }

  #childrenOf(node: MaestroSession.Node): MaestroSession.Node[] {
    const children = node[this.#childrenKey] ?? node["children"];
    return Array.isArray(children) ? (children as MaestroSession.Node[]) : [];
  }

  /**
   * Guesses a role from the attributes Maestro exposes. `hintText` is the only strong signal it
   * gives — a placeholder means a text input. Everything else is either a leaf that carries text
   * or a structural wrapper.
   */
  #inferRole(
    attrs: Record<string, string>,
    childCount: number,
  ): MaestroAccessibilityTree.Role {
    if (attrs["hintText"]) return "TextField";
    if (attrs["checked"] !== undefined) return "CheckBox";
    const hasText =
      !!attrs["text"] || !!attrs["accessibilityText"] || !!attrs["value"];
    if (childCount === 0 && hasText) return "Text";
    return "View";
  }

  elementById(rawId: number): AccessibilityElement {
    // Rendering populates the id map.
    this.toStr();

    const element = this.#elementsByRawId.get(rawId);
    if (!element) {
      throw new Error(`No element with raw_id=${rawId} found`);
    }
    return element;
  }

  /** Scopes the tree to the subtree rooted at `rawId`. */
  scopeToArea(rawId: number): MaestroAccessibilityTree {
    const found = this.#findNode(this.#hierarchy.elements, rawId);
    if (!found) return this;

    return new MaestroAccessibilityTree({
      ...this.#hierarchy,
      elements: [found],
    });
  }

  /**
   * Walks the raw hierarchy counting nodes in the same pre-order the renderer uses, so raw ids
   * resolve back to source nodes without re-parsing the rendered XML.
   */
  #findNode(
    nodes: MaestroSession.Node[],
    rawId: number,
  ): MaestroSession.Node | null {
    let counter = 0;

    const visit = (node: MaestroSession.Node): MaestroSession.Node | null => {
      counter += 1;
      if (counter === rawId) return node;
      for (const child of this.#childrenOf(node)) {
        const found = visit(child);
        if (found) return found;
      }
      return null;
    };

    for (const node of nodes) {
      const found = visit(node);
      if (found) return found;
    }
    return null;
  }

  /** Parses the centre point of a Maestro `[x1,y1][x2,y2]` bounds string. */
  static centreOf(bounds: string): { x: number; y: number } {
    const match = /\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/.exec(bounds);
    if (!match) throw new Error(`Unparsable Maestro bounds: ${bounds}`);
    const [x1, y1, x2, y2] = match.slice(1).map(Number) as [
      number,
      number,
      number,
      number,
    ];
    return {
      x: Math.round((x1 + x2) / 2),
      y: Math.round((y1 + y2) / 2),
    };
  }
}
