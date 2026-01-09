import { AccessibilityElement } from "./AccessibilityElement.js";
import { BaseAccessibilityTree } from "./BaseAccessibilityTree.js";

interface CDPNode {
  nodeId: string;
  parentId?: string;
  backendDOMNodeId?: number;
  role?: { value?: string };
  name?: { value?: string };
  ignored?: boolean;
  properties?: Array<{
    name?: string;
    value?: { value?: unknown };
  }>;
  childIds?: string[];
  _playwright_node?: boolean;
  _locator_info?: Record<string, unknown>;
  _frame_url?: string;
  _frame?: object;
}

interface CDPResponse {
  nodes: CDPNode[];
}

interface XMLElement {
  tag: string;
  attributes: Record<string, string>;
  children: XMLElement[];
  text?: string;
}

export class ChromiumAccessibilityTree extends BaseAccessibilityTree {
  private cdpResponse: CDPResponse;
  private nextRawId: number = 0;
  private raw: string | null = null;
  private frameMap: Map<number, object> = new Map();

  constructor(cdpResponse: unknown) {
    super();
    this.cdpResponse = cdpResponse as CDPResponse;
  }

  private static fromXml(
    xmlString: string,
    frameMap?: Map<number, object>
  ): ChromiumAccessibilityTree {
    const instance = new ChromiumAccessibilityTree({ nodes: [] });
    instance.raw = xmlString;
    if (frameMap) {
      instance.frameMap = frameMap;
    }
    return instance;
  }

  toStr(): string {
    if (this.raw !== null) {
      return this.raw;
    }

    const nodes = this.cdpResponse.nodes;
    const nodeLookup: Record<string, CDPNode> = {};

    for (const node of nodes) {
      nodeLookup[node.nodeId] = node;
    }

    // Build tree structure and convert to XML
    const rootNodes: XMLElement[] = [];
    for (const node of nodes) {
      if (!node.parentId) {
        const xmlNode = this.nodeToXml(node, nodeLookup);
        rootNodes.push(xmlNode);
      }
    }

    // Combine all root nodes into a single XML string
    let xmlString = "";
    for (const root of rootNodes) {
      xmlString += this.elementToString(root, 0);
    }

    this.raw = xmlString;
    return this.raw;
  }

  private nodeToXml(
    node: CDPNode,
    nodeLookup: Record<string, CDPNode>
  ): XMLElement {
    const role = node.role?.value || "unknown";
    const elem: XMLElement = {
      tag: role,
      attributes: {},
      children: [],
    };

    // Add our own sequential raw_id attribute
    this.nextRawId++;
    elem.attributes.raw_id = String(this.nextRawId);

    // Store frame reference if present
    if (node._frame) {
      this.frameMap.set(this.nextRawId, node._frame);
    }

    // Store Playwright node metadata
    if (node._playwright_node) {
      elem.attributes._playwright_node = "true";
    }
    if (node._locator_info) {
      elem.attributes._locator_info = JSON.stringify(node._locator_info);
    }
    if (node._frame_url) {
      elem.attributes._frame_url = node._frame_url;
    }

    // Add all node attributes as XML attributes
    if (node.backendDOMNodeId !== undefined) {
      elem.attributes.backendDOMNodeId = String(node.backendDOMNodeId);
    }
    if (node.nodeId !== undefined) {
      elem.attributes.nodeId = String(node.nodeId);
    }
    if (node.ignored !== undefined) {
      elem.attributes.ignored = String(node.ignored);
    }

    // Add name as attribute if present
    if (node.name?.value) {
      elem.attributes.name = node.name.value;
    }

    // Add properties as attributes
    if (node.properties) {
      for (const prop of node.properties) {
        const propName = prop.name || "";
        const propValue = prop.value;
        if (
          propValue &&
          typeof propValue === "object" &&
          "value" in propValue
        ) {
          elem.attributes[propName] = String(propValue.value);
        } else if (typeof propValue === "object") {
          // Complex property values (like nodeList) are converted to empty string
          elem.attributes[propName] = "";
        } else {
          elem.attributes[propName] = String(propValue);
        }
      }
    }

    // Process children recursively
    if (node.childIds) {
      for (const childId of node.childIds) {
        if (childId in nodeLookup) {
          const childElem = this.nodeToXml(nodeLookup[childId], nodeLookup);
          elem.children.push(childElem);
        }
      }
    }

    return elem;
  }

  private elementToString(elem: XMLElement, indent: number): string {
    const indentStr = "  ".repeat(indent);
    let result = `${indentStr}<${elem.tag}`;

    // Add attributes
    for (const [key, value] of Object.entries(elem.attributes)) {
      // Escape XML special characters
      const escapedValue = value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
      result += ` ${key}="${escapedValue}"`;
    }

    if (elem.children.length === 0 && !elem.text) {
      result += " />\n";
    } else {
      result += ">";
      if (elem.text) {
        result += elem.text;
      }
      if (elem.children.length > 0) {
        result += "\n";
        for (const child of elem.children) {
          result += this.elementToString(child, indent + 1);
        }
        result += indentStr;
      }
      result += `</${elem.tag}>\n`;
    }

    return result;
  }

  elementById(rawId: number): AccessibilityElement {
    const rawXml = this.toStr();
    const element = this.findElementByRawId(rawXml, rawId);

    if (!element) {
      throw new Error(`No element with raw_id=${rawId} found`);
    }

    // Handle Playwright nodes (cross-origin iframes)
    if (element.attributes._playwright_node === "true") {
      // Synthetic frame node
      if (element.attributes._frame_url) {
        return new AccessibilityElement(
          undefined,
          undefined,
          undefined,
          element.tag,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          this.frameMap.get(rawId),
          { _synthetic_frame: true, _frame_url: element.attributes._frame_url }
        );
      }

      // Regular Playwright node with locator info
      const locatorInfo = element.attributes._locator_info
        ? JSON.parse(element.attributes._locator_info)
        : {};

      return new AccessibilityElement(
        undefined,
        undefined,
        undefined,
        element.tag,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        this.frameMap.get(rawId),
        locatorInfo
      );
    }

    // Existing CDP node logic
    const backendNodeIdStr = element.attributes.backendDOMNodeId;
    if (!backendNodeIdStr) {
      throw new Error(
        `Element with raw_id=${rawId} has no backendDOMNodeId attribute`
      );
    }

    return new AccessibilityElement(
      undefined,
      undefined,
      undefined,
      element.tag,
      undefined,
      parseInt(backendNodeIdStr)
    );
  }

  scopeToArea(rawId: number): ChromiumAccessibilityTree {
    const rawXml = this.toStr();
    const element = this.findElementByRawId(rawXml, rawId);

    if (!element) {
      return this;
    }

    const scopedXml = this.elementToString(element, 0);
    return ChromiumAccessibilityTree.fromXml(scopedXml, this.frameMap);
  }

  private findElementByRawId(
    xmlString: string,
    targetRawId: number
  ): XMLElement | null {
    // Parse the XML string to find the element
    // This is a simple XML parser for our specific use case
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

  private parseSimpleXml(xmlString: string): XMLElement[] {
    const elements: XMLElement[] = [];
    const stack: XMLElement[] = [];

    // Combined regex for all XML tokens (opening tags, closing tags, self-closing tags)
    const tokenRegex =
      /<\/?([a-zA-Z_][\w:.-]*)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>/g;
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
