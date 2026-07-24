import { always } from "alwaysly";
import { render } from "dom-serializer";
import {
  Node as DOMHandlerNode,
  Element,
  NodeWithChildren,
  Text,
  hasChildren,
  isTag,
  isText,
} from "domhandler";
import { parseDocument } from "htmlparser2";
import { "default" as xmlFormatter } from "xml-formatter";

// NOTE: xml-formatter has busted types, so we need to cast it manually.
const xmlFormat: (typeof xmlFormatter)["default"] = xmlFormatter as any;

export namespace Xml {
  export type Node = DOMHandlerNode;

  export type AnyElement = Element | Text;
}

export abstract class Xml {
  static parseRootChildren(xml: string): Xml.Node[] {
    const root = parseDocument(xml.trim(), { xmlMode: true });
    return root.children;
  }

  static parseMultirootChildren(xml: string): Xml.Node[] {
    const wrappedXml = `<root>${xml.trim()}</root>`;
    return this.parseRootChildren(wrappedXml);
  }

  static parseAnyRootChildren(xml: string): Xml.Node[] {
    try {
      return this.parseRootChildren(xml);
    } catch {
      return this.parseMultirootChildren(xml);
    }
  }

  static parseRoot(xml: string): Element {
    const roots = Xml.parseRootChildren(xml);
    let root: Element | null = null;
    for (const node of roots) {
      const el = Xml.nodeAsTag(node);
      if (el && el.tagName === "root") {
        root = el;
        break;
      }
    }
    always(root);
    return root;
  }

  static format(els: Xml.AnyElement[]): string {
    let xml = "";
    for (const element of els) {
      Xml.#sanitizeElement(element);
      const rendered = render(element, {
        xmlMode: true,
        encodeEntities: false, // Skip encoding unicode text content, e.g., `1701–1870` -> `1701&#x2013;1870`.
        emptyAttrs: true, // Preserve empty attributes as-is, e.g., `value=""`.
        selfClosingTags: true,
      });
      xml += xmlFormat(rendered, {
        indentation: "  ",
        forceSelfClosingEmptyTag: true,
        lineSeparator: "\n",
      });
    }
    return xml;
  }

  static nodeAsTag(node: Xml.Node): Element | null {
    if (isTag(node)) {
      return node;
    }
    return null;
  }

  static nodeAsNodeWithChildren(node: Xml.Node): NodeWithChildren | null {
    if (hasChildren(node)) {
      return node;
    }
    return null;
  }

  static nodeAsText(node: Xml.Node): Text | null {
    if (isText(node)) {
      return node;
    }
    return null;
  }

  static #sanitizeElement(node: Xml.AnyElement): void {
    if (isText(node)) {
      node.data = Xml.#sanitizeText(node.data);
    } else if (isTag(node)) {
      for (const [k, v] of Object.entries(node.attribs)) {
        node.attribs[k] = Xml.#sanitizeAttr(v);
      }
      for (const child of node.children) {
        if (isText(child) || isTag(child)) Xml.#sanitizeElement(child);
      }
    }
  }

  // In text nodes only <, > and & must be escaped.
  static #sanitizeText(s: string): string {
    return s.replace(/[<>&\x00-\x08\x0B\x0C\x0E-\x1F]/g, (c) => {
      if (c === "<") return "&lt;";
      if (c === ">") return "&gt;";
      if (c === "&") return "&amp;";
      return `&#x${c.charCodeAt(0).toString(16).toUpperCase()};`;
    });
  }

  // In double-quoted attribute values <, &, " and control chars must be escaped.
  static #sanitizeAttr(s: string): string {
    return s.replace(/[<>&"\x00-\x08\x0B\x0C\x0E-\x1F\n\r\t]/g, (c) => {
      if (c === "<") return "&lt;";
      if (c === "&") return "&amp;";
      if (c === '"') return "&quot;";
      return `&#x${c.charCodeAt(0).toString(16).toUpperCase()};`;
    });
  }
}
