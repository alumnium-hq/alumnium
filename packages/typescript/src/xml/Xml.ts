import { always } from "alwaysly";
import { Element, isTag, isText, Text } from "domhandler";
import { parseDocument } from "htmlparser2";
import type * as DomHandler from "domhandler";

export namespace Xml {
  export type Node = DomHandler.Node;

  export type ChildNode = DomHandler.ChildNode;

  export type Element = DomHandler.Element;

  export type ElementAttrs = Record<string, string>;

  export type Text = DomHandler.Text;

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

  static parseRoot(xml: string): DomHandler.Element {
    const roots = Xml.parseRootChildren(xml);
    let root: DomHandler.Element | null = null;
    for (const node of roots) {
      const element = Xml.nodeAsTag(node);
      if (element?.tagName === "root") {
        root = element;
        break;
      }
    }
    always(root);
    return root;
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
    const element = new Element(content, attrs);
    element.children = children;
    return element;
  }
}
