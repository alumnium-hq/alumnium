import { always } from "alwaysly";
import { Element } from "domhandler";
import { Xml } from "../Xml.ts";
import type { AccessibilityElement } from "./AccessibilityElement.ts";
import { BaseAccessibilityTree } from "./BaseAccessibilityTree.ts";

export class XCUITestAccessibilityTree extends BaseAccessibilityTree {
  #xmlString: string;
  #nextRawId: number = 0;
  #raw: string | null = null;

  constructor(xmlString: string) {
    super();
    this.#xmlString = xmlString;
  }

  /** Parse XML and add raw_id attributes to all elements. */
  toStr(): string {
    if (this.#raw !== null) {
      return this.#raw;
    }

    // Parse the XML
    const root = this.#parseRoot(this.#xmlString);

    // Add raw_id attributes recursively
    this.#addRawIds(root);

    // Serialize back to string
    this.#raw = Xml.format([root]);
    return this.#raw;
  }

  /** Recursively add raw_id attribute to element and its children. */
  #addRawIds(elem: Element): void {
    this.#nextRawId += 1;
    elem.attribs["raw_id"] = String(this.#nextRawId);
    for (const child of elem.children) {
      const childEl = Xml.nodeAsTag(child);
      if (!childEl) {
        continue;
      }
      this.#addRawIds(childEl);
    }
  }

  /**
   * Find element by raw_id and return its properties for XPath construction.
   *
   * @param rawId The raw_id to search for
   * @returns AccessibilityElement with type, name, value, label attributes
   */
  elementById(rawId: number): AccessibilityElement {
    // Get raw XML with raw_id attributes
    const rawXml = this.toStr();
    const root = this.#parseRoot(rawXml);

    // Find element with matching raw_id
    const findElement = (elem: Element, targetId: string): Element | null => {
      if (elem.attribs["raw_id"] === targetId) {
        return elem;
      }
      for (const child of elem.children) {
        const childEl = Xml.nodeAsTag(child);
        if (!childEl) {
          continue;
        }
        const result = findElement(childEl, targetId);
        if (result !== null) {
          return result;
        }
      }
      return null;
    };

    const element = findElement(root, String(rawId));
    if (element === null) {
      throw new Error(`No element with raw_id=${rawId} found`);
    }

    // Extract properties for XCUITest
    return {
      id: rawId,
      type: element.tagName,
      name: element.attribs["name"],
      value: element.attribs["value"],
      label: element.attribs["label"],
    };
  }

  /** Scope the tree to a smaller subtree identified by raw_id. */
  scopeToArea(rawId: number): XCUITestAccessibilityTree {
    const rawXml = this.toStr();

    // Parse the XML
    const root = this.#parseRoot(rawXml);

    // Find the element with the matching raw_id
    const findElement = (elem: Element, targetId: string): Element | null => {
      if (elem.attribs["raw_id"] === targetId) {
        return elem;
      }
      for (const child of elem.children) {
        const childEl = Xml.nodeAsTag(child);
        if (!childEl) {
          continue;
        }
        const result = findElement(childEl, targetId);
        if (result !== null) {
          return result;
        }
      }
      return null;
    };

    const targetElem = findElement(root, String(rawId));

    if (targetElem === null) {
      // If not found, return original tree
      return this;
    }

    // Convert the scoped element back to XML string
    const scopedXml = Xml.format([targetElem]);

    return new XCUITestAccessibilityTree(scopedXml);
  }

  #parseRoot(xml: string): Element {
    const roots = Xml.parseRootChildren(xml);
    let root: Element | null = null;
    for (const node of roots) {
      const el = Xml.nodeAsTag(node);
      if (el) {
        root = el;
        break;
      }
    }
    always(root);
    return root;
  }
}
