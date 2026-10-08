import { always } from "alwaysly";
import { Element } from "domhandler";
import { Xml } from "../xml/Xml.ts";
import { XmlRenderer } from "../xml/XmlRenderer.ts";
import type { AccessibilityElement } from "./AccessibilityElement.ts";
import { BaseAccessibilityTree } from "./BaseAccessibilityTree.ts";

export class XCUITestAccessibilityTree extends BaseAccessibilityTree<string> {
  #xmlString: string;
  #nextRawId: number = 0;
  #fullTree: XCUITestAccessibilityTree | null;

  protected override get kind(): string {
    return "xcuitest";
  }

  /**
   * @param xmlString XCUITest page source
   * @param fullTree Full tree this one was scoped from. When present, the XML
   *   already carries raw_id attributes and lookups are delegated to the full
   *   tree so that element indexes are relative to the whole app.
   */
  constructor(
    xmlString: string,
    fullTree: XCUITestAccessibilityTree | null = null,
  ) {
    super(xmlString);
    this.#xmlString = xmlString;
    this.#fullTree = fullTree;
    if (fullTree) {
      this.xml = xmlString;
    }
  }

  /** Parse XML and add raw_id attributes to all elements. */
  toStr(): string {
    if (this.xml !== null) {
      return this.xml;
    }

    // Parse the XML
    const root = this.#parseRoot(this.#xmlString);

    // Add raw_id attributes recursively
    this.#addRawIds(root);

    // Serialize back to string
    return (this.xml = XmlRenderer.render([root]));
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
    if (this.#fullTree) {
      return this.#fullTree.elementById(rawId);
    }

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
      index: this.#predicateIndex(root, element),
    };
  }

  /**
   * Position of the element among all elements matching the same iOS
   * predicate (type plus non-empty name, value and label) in document order.
   */
  #predicateIndex(root: Element, element: Element): number {
    const attrs = ["name", "value", "label"];
    let index = 0;
    const visit = (candidate: Element): boolean => {
      if (candidate === element) {
        return true;
      }
      if (
        candidate.tagName === element.tagName &&
        attrs.every(
          (attr) =>
            !element.attribs[attr] ||
            candidate.attribs[attr] === element.attribs[attr],
        )
      ) {
        index += 1;
      }
      for (const child of candidate.children) {
        const childEl = Xml.nodeAsTag(child);
        if (childEl && visit(childEl)) {
          return true;
        }
      }
      return false;
    };
    visit(root);
    return index;
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
    const scopedXml = XmlRenderer.render([targetElem]);

    return new XCUITestAccessibilityTree(scopedXml, this.#fullTree ?? this);
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
