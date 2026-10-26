import { Element } from "domhandler";
import { Telemetry } from "../telemetry/Telemetry.ts";
import { Xml } from "../xml/Xml.ts";
import { XmlRenderer } from "../xml/XmlRenderer.ts";
import type { AccessibilityElement } from "./AccessibilityElement.ts";
import { BaseAccessibilityTree } from "./BaseAccessibilityTree.ts";

const { tracer } = Telemetry.get(import.meta.url);
const { span } = tracer.dec();
const PRESERVE_FALSE_ATTRS = new Set(["checked"]);
const STATE_ATTRS = [
  "checked",
  "disabled",
  "expanded",
  "level",
  "pressed",
  "selected",
  "url",
  "placeholder",
] as const;

/**
 * Accessibility tree built from an ARIA snapshot computed in the page (e.g. by
 * acquiescence's `AriaSnapshotGenerator`), with elements addressed by their
 * WebDriver BiDi shared IDs.
 */
export class AriaAccessibilityTree extends BaseAccessibilityTree<
  AriaAccessibilityTree.Source | string
> {
  #source: AriaAccessibilityTree.Source | null = null;
  private nextRawId: number = 0;

  protected override get kind(): string {
    return "aria";
  }

  constructor(sourceOrXml: AriaAccessibilityTree.Source | string) {
    super(sourceOrXml);

    if (typeof sourceOrXml === "object") {
      this.#source = sourceOrXml;
      return;
    }

    this.xml = sourceOrXml;
  }

  @span("driver.tree.to_str", { "driver.tree.platform": "aria" })
  async toStr(): Promise<string> {
    if (this.xml !== null) {
      return this.xml;
    }

    if (!this.#source) {
      return (this.xml = "");
    }

    const root = this.#nodeToXml(this.#source.root, this.#source);
    this.xml = XmlRenderer.render([root], {
      preserveFalseAttrs: PRESERVE_FALSE_ATTRS,
    });
    return this.xml;
  }

  #nodeToXml(
    node: AriaAccessibilityTree.Node,
    source: AriaAccessibilityTree.Source,
  ): Element {
    const role = node.role === "fragment" ? "RootWebArea" : node.role;
    const elem = this.#element(role);

    const sharedId = node.ref ? source.sharedIds[node.ref] : undefined;
    if (sharedId) elem.attribs["sharedId"] = sharedId;
    if (node.name) elem.attribs["name"] = node.name;
    const value = node.ref ? source.values?.[node.ref] : undefined;
    if (value) elem.attribs["value"] = value;
    for (const attr of STATE_ATTRS) {
      const value = node[attr];
      if (value !== undefined) elem.attribs[attr] = String(value);
    }

    for (const child of node.children) {
      const childElem =
        typeof child === "string"
          ? this.#textToXml(child)
          : this.#nodeToXml(child, source);
      this.#append(elem, childElem);
    }

    return elem;
  }

  #textToXml(text: string): Element {
    const elem = this.#element("text");
    elem.attribs["name"] = text;
    return elem;
  }

  #element(role: string): Element {
    this.nextRawId++;
    return new Element(role, { raw_id: String(this.nextRawId) });
  }

  #append(parent: Element, child: Element) {
    child.parent = parent;
    const prev = parent.children[parent.children.length - 1];
    if (prev) {
      prev.next = child;
      child.prev = prev;
    }
    parent.children.push(child);
  }

  @span("driver.tree.element_by_id", { "driver.tree.platform": "aria" })
  async elementById(rawId: number): Promise<AccessibilityElement> {
    const element = await this.#findByRawId(rawId);
    if (element === null) {
      throw new Error(`No element with raw_id=${rawId} found`);
    }

    const sharedId = element.attribs["sharedId"];
    if (sharedId === undefined) {
      throw new Error(`Element with raw_id=${rawId} has no sharedId attribute`);
    }

    return { type: element.tagName, sharedId };
  }

  @span("driver.tree.scope_to_area", { "driver.tree.platform": "aria" })
  async scopeToArea(rawId: number): Promise<AriaAccessibilityTree> {
    const element = await this.#findByRawId(rawId);
    if (element === null) return this;

    const scopedXml = XmlRenderer.render([element], {
      preserveFalseAttrs: PRESERVE_FALSE_ATTRS,
    });
    return new AriaAccessibilityTree(scopedXml);
  }

  async #findByRawId(rawId: number): Promise<Element | null> {
    const root = Xml.parseRoot(`<root>${await this.toStr()}</root>`);
    const targetId = String(rawId);
    const find = (elem: Element): Element | null => {
      if (elem.attribs["raw_id"] === targetId) return elem;
      for (const child of elem.children) {
        const childEl = Xml.nodeAsTag(child);
        const result = childEl && find(childEl);
        if (result) return result;
      }
      return null;
    };
    return find(root);
  }
}

export namespace AriaAccessibilityTree {
  // Mirrors acquiescence's `AriaNode`.
  // https://github.com/jimevans/acquiescence/blob/main/src/ariaSnapshotGenerator.ts
  export interface Node {
    role: string;
    name: string;
    ref?: string | undefined;
    checked?: boolean | "mixed" | undefined;
    disabled?: boolean | undefined;
    expanded?: boolean | undefined;
    level?: number | undefined;
    pressed?: boolean | "mixed" | undefined;
    selected?: boolean | undefined;
    url?: string | undefined;
    placeholder?: string | undefined;
    children: Array<Node | string>;
  }

  export interface Source {
    root: Node;
    /** Snapshot ref -> WebDriver BiDi shared ID of its element. */
    sharedIds: Record<string, string>;
    /** Snapshot ref -> value the snapshot leaves out, e.g. chosen files. */
    values?: Record<string, string> | undefined;
  }
}
