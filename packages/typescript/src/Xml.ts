import { always } from "alwaysly";
import { render } from "dom-serializer";
import { isTag, isText, Text, Element } from "domhandler";
import { parseDocument } from "htmlparser2";
import { "default" as xmlFormatter } from "xml-formatter";
import type * as DomHandler from "domhandler";

// NOTE: xml-formatter has busted types, so we need to cast it manually.
const xmlFormat: (typeof xmlFormatter)["default"] = xmlFormatter as any;

export namespace Xml {
  export type Node = DomHandler.Node;

  export type ChildNode = DomHandler.ChildNode;

  export type Element = DomHandler.Element;

  export type ElementAttrs = Record<string, string>;

  export type Text = DomHandler.Text;

  export type AnyElement = Element | Text;

  export interface FormatOptions {
    minify?: boolean;
  }
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

  static parseRoot(xml: string): DomHandler.Element {
    const roots = Xml.parseRootChildren(xml);
    let root: DomHandler.Element | null = null;
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

  static format(
    els: Xml.AnyElement[],
    options: Xml.FormatOptions = {},
  ): string {
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

    // Remove leading whitespace and newlines from the formatted XML.
    if (options.minify) xml = xml.replace(/(^\s+|\n)/gm, "");

    return xml;
  }

  static isTag(node: Xml.Node): node is Xml.Element {
    return isTag(node);
  }

  static nodeAsTag(node: Xml.Node): Xml.Element | null {
    if (isTag(node)) return node;
    return null;
  }

  static nodeAsText(node: Xml.Node): Xml.Text | null {
    if (isText(node)) return node;
    return null;
  }

  static text(content: string): Xml.Text {
    return new Text(content);
  }

  static element(
    content: string,
    attrs: Xml.ElementAttrs = {},
    children: Xml.AnyElement[] = [],
  ): Xml.Element {
    const el = new Element(content, attrs);
    el.children = children as any;
    return el;
  }

  static #sanitizeElement(node: Xml.AnyElement): void {
    if (isText(node)) {
      node.data = Xml.#sanitizeText(node.data);
    } else if (isTag(node)) {
      for (const [name, value] of Object.entries(node.attribs))
        node.attribs[name] = Xml.#sanitizeAttr(value);

      for (const child of node.children)
        if (isText(child) || isTag(child)) Xml.#sanitizeElement(child);
    }
  }

  // In text nodes only <, > and & must be escaped.
  static #sanitizeText(s: string): string {
    // oxlint-disable-next-line no-control-regex
    return s.replace(/[<>&\x00-\x08\x0B\x0C\x0E-\x1F]/g, (c) => {
      if (c === "<") return "&lt;";
      if (c === ">") return "&gt;";
      if (c === "&") return "&amp;";
      return `&#x${c.charCodeAt(0).toString(16).toUpperCase()};`;
    });
  }

  // In double-quoted attribute values <, &, " and control chars must be escaped.
  static #sanitizeAttr(s: string): string {
    // oxlint-disable-next-line no-control-regex
    return s.replace(/[<>&"\x00-\x08\x0B\x0C\x0E-\x1F\n\r\t]/g, (c) => {
      if (c === "<") return "&lt;";
      if (c === "&") return "&amp;";
      if (c === '"') return "&quot;";
      return `&#x${c.charCodeAt(0).toString(16).toUpperCase()};`;
    });
  }
}
