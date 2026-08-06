/**
 * @module XmlRenderer
 *
 * Based on `dom-serializer`: https://github.com/cheeriojs/dom-serializer
 * Copyright © 2022 The Cheerio contributors.
 */

import * as ElementType from "domelementtype";
import { Element, Text } from "domhandler";
import type {
  AnyNode,
  CDATA,
  Comment,
  ProcessingInstruction,
} from "domhandler";

export namespace XmlRenderer {
  export interface Options {
    minify?: boolean;
    indentation?: string;
  }
}

export abstract class XmlRenderer {
  static render(
    node: AnyNode | ArrayLike<AnyNode>,
    options: XmlRenderer.Options = {},
  ): string {
    const nodes = "length" in node ? node : [node];
    const output = this.#renderFormattedChildren(nodes, options, 0, false);
    return options.minify ? output.replace(/\n\s*/g, "") : output;
  }

  static #renderFormattedChildren(
    children: ArrayLike<AnyNode>,
    options: XmlRenderer.Options,
    depth: number,
    preserveSpace: boolean,
  ): string {
    let output = "";

    for (let index = 0; index < children.length; index++) {
      const child = children[index]!;
      if (child.type === ElementType.Text && !preserveSpace) {
        let data = child.data;
        while (children[index + 1]?.type === ElementType.Text) {
          data += (children[++index] as Text).data;
        }

        const trimmed = this.#sanitizeText(data.trim());
        if (!trimmed) continue;
        if (output) output += "\n";
        output += `${this.#indent(depth, options)}${trimmed}`;
        continue;
      }

      const rendered = this.#renderFormattedNode(
        child,
        options,
        depth,
        preserveSpace,
      );
      if (!rendered) continue;
      if (output && !preserveSpace) output += "\n";
      output += rendered;
    }

    return output;
  }

  static #renderFormattedNode(
    node: AnyNode,
    options: XmlRenderer.Options,
    depth: number,
    preserveSpace: boolean,
  ): string {
    if (node.type === ElementType.Root) {
      return this.#renderFormattedChildren(
        node.children,
        options,
        depth,
        preserveSpace,
      );
    }

    if (node.type === ElementType.Text) {
      const data = this.#sanitizeText(
        preserveSpace ? node.data : node.data.trim(),
      );
      if (!data) return "";
      return `${preserveSpace ? "" : this.#indent(depth, options)}${data}`;
    }

    if (
      node.type === ElementType.Script ||
      node.type === ElementType.Style ||
      node.type === ElementType.Tag
    ) {
      return this.#renderFormattedTag(
        node as Element,
        options,
        depth,
        preserveSpace,
      );
    }

    if (node.type === ElementType.Directive) {
      const directive = node as ProcessingInstruction;
      const suffix = directive.name.startsWith("?") ? "?" : "";
      return `${preserveSpace ? "" : this.#indent(depth, options)}<${directive.data}${suffix}>`;
    }

    const prefix = preserveSpace ? "" : this.#indent(depth, options);
    if (node.type === ElementType.Comment) {
      return `${prefix}<!--${(node as Comment).data}-->`;
    }
    if (node.type === ElementType.CDATA) {
      return `${prefix}<![CDATA[${((node as CDATA).children[0] as Text).data}]]>`;
    }
    return "";
  }

  static #renderFormattedTag(
    element: Element,
    options: XmlRenderer.Options,
    depth: number,
    preserveSpace: boolean,
  ): string {
    const name = element.name;
    const prefix = preserveSpace ? "" : this.#indent(depth, options);
    const attributes = this.#formatAttributes(element.attribs);
    const children = element.children;

    if (!children.length) return `${prefix}<${name}${attributes}/>`;

    const nodePreserveSpace =
      preserveSpace || element.attribs["xml:space"] === "preserve";
    const renderedChildren = this.#renderFormattedChildren(
      children,
      options,
      depth + 1,
      nodePreserveSpace,
    );

    if (!renderedChildren) {
      return `${prefix}<${name}${attributes}>\n${this.#indent(depth, options)}</${name}>`;
    }
    if (nodePreserveSpace) {
      return `${prefix}<${name}${attributes}>${renderedChildren}</${name}>`;
    }

    return `${prefix}<${name}${attributes}>\n${renderedChildren}\n${this.#indent(depth, options)}</${name}>`;
  }

  static #formatAttributes(
    attributes: Record<string, unknown> | undefined,
  ): string {
    if (!attributes) return "";

    let result = "";

    for (const key in attributes) {
      const value = attributes[key];
      result += ` ${key}="${this.#sanitizeAttr(value == null ? "" : String(value))}"`;
    }

    return result;
  }

  static #sanitizeText(value: string): string {
    // oxlint-disable-next-line no-control-regex
    return value.replace(/[<>&\x00-\x08\x0B\x0C\x0E-\x1F]/g, (character) => {
      if (character === "<") return "&lt;";
      if (character === ">") return "&gt;";
      if (character === "&") return "&amp;";
      return `&#x${character.charCodeAt(0).toString(16).toUpperCase()};`;
    });
  }

  static #sanitizeAttr(value: string): string {
    return value.replace(
      // oxlint-disable-next-line no-control-regex
      /[<>&"\x00-\x08\x0B\x0C\x0E-\x1F\n\r\t]/g,
      (character) => {
        if (character === "<") return "&lt;";
        if (character === "&") return "&amp;";
        if (character === '"') return "&quot;";
        return `&#x${character.charCodeAt(0).toString(16).toUpperCase()};`;
      },
    );
  }

  static #indent(depth: number, options: XmlRenderer.Options): string {
    return (options.indentation ?? "  ").repeat(depth);
  }
}
