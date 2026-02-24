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

  export function parse(xml: string): Node[] {
    const root = parseDocument(xml.trim(), { xmlMode: true });
    return root.children;
  }

  export function parseMultiroot(xml: string): Node[] {
    const wrappedXml = `<root>${xml.trim()}</root>`;
    return parse(wrappedXml);
  }

  export function parseAny(xml: string): Node[] {
    try {
      return parse(xml);
    } catch {
      return parseMultiroot(xml);
    }
  }

  export function format(els: Element[]): string {
    let xml = "";
    for (const element of els) {
      xml += xmlFormat(
        render(element, {
          xmlMode: true,
          encodeEntities: "utf8",
          emptyAttrs: true,
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

  export function nodeAsTag(node: Node): Element | undefined {
    if (isTag(node)) {
      return node;
    }
  }

  export function nodeAsNodeWithChildren(
    node: Node,
  ): NodeWithChildren | undefined {
    if (hasChildren(node)) {
      return node;
    }
  }

  export function nodeAsText(node: Node): Text | undefined {
    if (isText(node)) {
      return node;
    }
  }
}
