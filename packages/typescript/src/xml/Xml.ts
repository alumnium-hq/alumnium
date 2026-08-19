import { always } from "alwaysly";
import { Element, isTag, isText, Text } from "domhandler";
import { Parser } from "htmlparser2";
import * as DomHandler from "domhandler";

export namespace Xml {
  export type Node = DomHandler.Node;

  export type ChildNode = DomHandler.ChildNode;

  export type Tag = DomHandler.Element;

  export type TagAttrs = Record<string, string>;

  export type Text = DomHandler.Text;

  export type AnyElement = Tag | Text;
}

export abstract class Xml {
  static parseRootChildren(xml: string): Xml.Node[] {
    const handler = new DomHandler.DomHandler();

    const originalOnopentag = handler.onopentag;
    let truishAttrs: Record<string, string> = {};

    // @ts-expect-error: DomHandler is poorly typed.
    handler.onopentagname = () => (truishAttrs = {});

    // @ts-expect-error: See above.
    handler.onattribute = (
      name: string,
      value: string,
      quote: string | undefined,
    ) => {
      if (value === "" && quote === undefined) truishAttrs[name] = "true";
    };

    handler.onopentag = (name, attribs) => {
      // NOTE: Weirdly this is the way to parse no-value attributes,
      // i.e., `checked`. See: https://github.com/fb55/htmlparser2/issues/974
      originalOnopentag.call(handler, name, { ...attribs, ...truishAttrs });
    };

    const parser = new Parser(handler, {
      xmlMode: true,
      lowerCaseTags: false,
      lowerCaseAttributeNames: false,
      recognizeSelfClosing: true,
    });

    parser.write(xml.trim());
    parser.end();

    return handler.root.children;
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
      const tag = Xml.nodeAsTag(node);
      if (tag?.tagName === "root") {
        root = tag;
        break;
      }
    }
    always(root);
    return root;
  }

  static isTag(node: Xml.Node): node is Xml.Tag {
    return isTag(node);
  }

  static nodeAsTag(node: Xml.Node): Xml.Tag | null {
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

  static tag(
    content: string,
    attrs: Xml.TagAttrs = {},
    children: Xml.AnyElement[] = [],
  ): Xml.Tag {
    const tag = new Element(content, attrs);
    tag.children = children;
    return tag;
  }
}
