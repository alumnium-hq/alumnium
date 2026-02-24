import { always } from "alwaysly";
import { Element } from "domhandler";
import { pythonicSplitlines } from "../pythonic/pythonicSplitlines.ts";
import { XML } from "../xml/index.ts";
import { AccessibilityElement } from "./AccessibilityElement.js";
import { BaseAccessibilityTree } from "./BaseAccessibilityTree.js";

export class UIAutomator2AccessibilityTree extends BaseAccessibilityTree {
  #xmlString: string;
  #nextRawId: number;
  #raw: string | null;

  constructor(xmlString: string) {
    super();
    // cleaning multiple xml declaration lines from page source
    const xmlDeclarationPattern = /^\s*<\?xml.*\?>\s*$/;
    const lines = pythonicSplitlines(xmlString);
    const cleanedLines = lines.filter(
      (line) => !xmlDeclarationPattern.test(line),
    );
    const cleanedXmlContent = cleanedLines.join("\n");
    this.#xmlString = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>\n <root>\n${cleanedXmlContent}\n</root>`;

    this.#nextRawId = 0;
    this.#raw = null;
  }

  /** Parse XML and add raw_id attributes to all elements. */
  toStr(): string {
    if (this.#raw !== null) {
      return this.#raw;
    }

    // Parse the XML
    // TODO: Simplify after figuring out multiroot shenanigans.
    // Also refactor duplicate roots -> root code below.
    const root = XML.parseRoot(this.#xmlString);

    // Add raw_id attributes recursively
    this.#addRawIds(root);

    // Serialize back to string
    this.#raw = XML.format([root]);
    return this.#raw;
  }

  /** Recursively add raw_id attribute to element and its children. */
  #addRawIds(elem: Element): void {
    this.#nextRawId += 1;
    elem.attribs["raw_id"] = String(this.#nextRawId);
    for (const child of elem.children) {
      const el = XML.nodeAsTag(child);
      if (!el) continue; // Skip non-element nodes, e.g., text nodes
      this.#addRawIds(el);
    }
  }

  /**
   * Find element by raw_id and return its properties for XPath construction.
   *
   * @param rawId The raw_id to search for
   * @returns AccessibilityElement with type, androidresourceid, androidtext, androidcontentdesc, androidbounds
   */
  elementById(rawId: number): AccessibilityElement {
    // Get raw XML with raw_id attributes
    const rawXml = this.toStr();
    const root = XML.parseRoot(rawXml);

    // Find element with matching raw_id
    function findElement(elem: Element, targetId: string): Element | null {
      if (elem.attribs["raw_id"] === targetId) {
        return elem;
      }
      for (const child of Array.from(elem.children)) {
        const childEl = XML.nodeAsTag(child);
        if (!childEl) continue; // Skip non-element nodes, e.g., text nodes
        const result = findElement(childEl, targetId);
        if (result !== null) {
          return result;
        }
      }
      return null;
    }

    const element = findElement(root, String(rawId));
    if (element === null) {
      throw new Error(`No element with raw_id=${rawId} found`);
    }

    // Extract properties for UIAutomator2
    const accessibilityElement: AccessibilityElement = {
      id: rawId,
      type: element.attribs["class"] ?? element.tagName,
      androidResourceId: element.attribs["resource-id"] ?? undefined,
      androidText: element.attribs["text"] ?? undefined,
      androidContentDesc: element.attribs["content-desc"] ?? undefined,
      androidBounds: element.attribs["bounds"] ?? undefined,
    };

    return accessibilityElement;
  }

  /** Scope the tree to a smaller subtree identified by raw_id. */
  scopeToArea(rawId: number): UIAutomator2AccessibilityTree {
    const rawXml = this.toStr();

    // Parse the XML
    const root = XML.parseRoot(rawXml);

    // Find the element with the matching raw_id
    function findElement(elem: Element, targetId: string): Element | null {
      if (elem.attribs["raw_id"] === targetId) {
        return elem;
      }
      for (const child of Array.from(elem.children)) {
        const childEl = XML.nodeAsTag(child);
        always(childEl);
        const result = findElement(childEl, targetId);
        if (result !== null) {
          return result;
        }
      }
      return null;
    }

    const targetElem = findElement(root, String(rawId));

    if (targetElem === null) {
      // If not found, return original tree
      return this;
    }

    // Convert the scoped element back to XML string
    const scopedXml = XML.format([targetElem]);

    return new UIAutomator2AccessibilityTree(scopedXml);
  }
}
