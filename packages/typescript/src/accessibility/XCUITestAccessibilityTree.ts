import { AccessibilityElement } from "./AccessibilityElement.js";
import { BaseAccessibilityTree } from "./BaseAccessibilityTree.js";

interface XMLElement {
  tag: string;
  attributes: Record<string, string>;
  children: XMLElement[];
}

export class XCUITestAccessibilityTree extends BaseAccessibilityTree {
  private xmlString: string;
  private nextRawId: number = 0;
  private raw: string | null = null;

  constructor(xmlString: string) {
    super();
    this.xmlString = xmlString;
  }

  toStr(): string {
    if (this.raw !== null) {
      return this.raw;
    }

    // Parse the XML
    const elements = this.parseSimpleXml(this.xmlString);

    // Add raw_id attributes recursively
    for (const elem of elements) {
      this.addRawIds(elem);
    }

    // Serialize back to string
    let result = "";
    for (const elem of elements) {
      result += this.elementToString(elem, 0);
    }

    this.raw = result;
    return this.raw;
  }

  private addRawIds(elem: XMLElement): void {
    this.nextRawId++;
    elem.attributes.raw_id = String(this.nextRawId);
    for (const child of elem.children) {
      this.addRawIds(child);
    }
  }

  elementById(rawId: number): AccessibilityElement {
    const rawXml = this.toStr();
    const element = this.findElementByRawId(rawXml, rawId);

    if (!element) {
      throw new Error(`No element with raw_id=${rawId} found`);
    }

    // Extract properties for XCUITest
    return new AccessibilityElement(
      rawId,
      element.attributes.name,
      element.attributes.label,
      element.tag,
      element.attributes.value
    );
  }

  scopeToArea(rawId: number): XCUITestAccessibilityTree {
    const rawXml = this.toStr();
    const element = this.findElementByRawId(rawXml, rawId);

    if (!element) {
      return this;
    }

    const scopedXml = this.elementToString(element, 0);
    return new XCUITestAccessibilityTree(scopedXml);
  }

  private findElementByRawId(
    xmlString: string,
    targetRawId: number
  ): XMLElement | null {
    const elements = this.parseSimpleXml(xmlString);

    const search = (elem: XMLElement): XMLElement | null => {
      if (elem.attributes.raw_id === String(targetRawId)) {
        return elem;
      }
      for (const child of elem.children) {
        const result = search(child);
        if (result) return result;
      }
      return null;
    };

    for (const elem of elements) {
      const result = search(elem);
      if (result) return result;
    }

    return null;
  }

  private elementToString(elem: XMLElement, indent: number): string {
    const indentStr = "  ".repeat(indent);
    let result = `${indentStr}<${elem.tag}`;

    // Add attributes
    for (const [key, value] of Object.entries(elem.attributes)) {
      const escapedValue = value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
      result += ` ${key}="${escapedValue}"`;
    }

    if (elem.children.length === 0) {
      result += " />\n";
    } else {
      result += ">\n";
      for (const child of elem.children) {
        result += this.elementToString(child, indent + 1);
      }
      result += `${indentStr}</${elem.tag}>\n`;
    }

    return result;
  }

  private parseSimpleXml(xmlString: string): XMLElement[] {
    const elements: XMLElement[] = [];
    const stack: XMLElement[] = [];

    // Combined regex for all XML tokens (opening tags, closing tags, self-closing tags)
    const tokenRegex = /<\/?([a-zA-Z_][\w:.-]*)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>/g;
    const attrRegex = /([\w:.-]+)="([^"]*)"/g;

    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(xmlString)) !== null) {
      const fullMatch = match[0];
      const tagName = match[1];
      const attrsString = match[2];
      const selfClosing = match[3] === "/";
      const isClosingTag = fullMatch.startsWith("</");

      if (isClosingTag) {
        // Handle closing tag - pop from stack
        if (stack.length > 0 && stack[stack.length - 1].tag === tagName) {
          stack.pop();
        }
      } else {
        // Handle opening or self-closing tag
        // Parse attributes
        const attributes: Record<string, string> = {};
        let attrMatch: RegExpExecArray | null;
        attrRegex.lastIndex = 0;
        while ((attrMatch = attrRegex.exec(attrsString)) !== null) {
          attributes[attrMatch[1]] = attrMatch[2];
        }

        const elem: XMLElement = {
          tag: tagName,
          attributes,
          children: [],
        };

        if (stack.length > 0) {
          stack[stack.length - 1].children.push(elem);
        } else {
          elements.push(elem);
        }

        if (!selfClosing) {
          stack.push(elem);
        }
      }
    }

    return elements;
  }
}
