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

export namespace XML {
  export type Node = DOMHandlerNode;

  export type AnyElement = Element | Text;

  // NOTE: xml-formatter has busted types, so we need to cast it manually.
  const xmlFormat: (typeof xmlFormatter)["default"] = xmlFormatter as any;

  export function parseRootChildren(xml: string): Node[] {
    const root = parseDocument(xml.trim(), { xmlMode: true });
    return root.children;
  }

  export function parseMultirootChildren(xml: string): Node[] {
    const wrappedXml = `<root>${xml.trim()}</root>`;
    return parseRootChildren(wrappedXml);
  }

  export function parseAnyRootChildren(xml: string): Node[] {
    try {
      return parseRootChildren(xml);
    } catch {
      return parseMultirootChildren(xml);
    }
  }

  export function parseRoot(xml: string): Element {
    const roots = XML.parseRootChildren(xml);
    let root: Element | null = null;
    for (const node of roots) {
      const el = XML.nodeAsTag(node);
      if (el && el.tagName === "root") {
        root = el;
        break;
      }
    }
    always(root);
    return root;
  }

  export function format(els: AnyElement[]): string {
    let xml = "";
    for (const element of els) {
      xml += xmlFormat(
        render(element, {
          xmlMode: true,
          encodeEntities: false, // Skip encoding unicode text content, e.g., `1701–1870` -> `1701&#x2013;1870`.
          emptyAttrs: true, // Preserve empty attributes as-is, e.g., `value=""`.
          selfClosingTags: true,
        }),
        {
          indentation: "  ",
          forceSelfClosingEmptyTag: true,
          lineSeparator: "\n",
        },
      );
    }
    return xml;
  }

  export function nodeAsTag(node: Node): Element | null {
    if (isTag(node)) {
      return node;
    }
    return null;
  }

  export function nodeAsNodeWithChildren(node: Node): NodeWithChildren | null {
    if (hasChildren(node)) {
      return node;
    }
    return null;
  }

  export function nodeAsText(node: Node): Text | null {
    if (isText(node)) {
      return node;
    }
    return null;
  }
}
