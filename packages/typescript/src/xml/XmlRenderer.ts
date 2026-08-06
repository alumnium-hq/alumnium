/**
 * @module XmlRenderer
 *
 * Based on `dom-serializer`: https://github.com/cheeriojs/dom-serializer
 * Copyright © 2022 The Cheerio contributors.
 */

import * as ElementType from "domelementtype";
import { Element, isTag, isText, Text } from "domhandler";
import { encodeXML, escapeAttribute, escapeText } from "entities";
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
    emptyAttrs?: boolean;
    selfClosingTags?: boolean;
    xmlMode?: boolean | "foreign";
    encodeEntities?: boolean | "utf8";
    decodeEntities?: boolean;
  }
}

export abstract class XmlRenderer {
  static #unencodedElements = new Set([
    "style",
    "script",
    "xmp",
    "iframe",
    "noembed",
    "noframes",
    "plaintext",
    "noscript",
  ]);

  static #voidElements = new Set([
    "area",
    "base",
    "basefont",
    "br",
    "col",
    "command",
    "embed",
    "frame",
    "hr",
    "img",
    "input",
    "isindex",
    "keygen",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
  ]);

  static #foreignElements = new Set(["svg", "math"]);

  static #foreignModeIntegrationPoints = new Set([
    "mi",
    "mo",
    "mn",
    "ms",
    "mtext",
    "annotation-xml",
    "foreignObject",
    "desc",
    "title",
  ]);

  static #elementNames = new Map(
    [
      "altGlyph",
      "altGlyphDef",
      "altGlyphItem",
      "animateColor",
      "animateMotion",
      "animateTransform",
      "clipPath",
      "feBlend",
      "feColorMatrix",
      "feComponentTransfer",
      "feComposite",
      "feConvolveMatrix",
      "feDiffuseLighting",
      "feDisplacementMap",
      "feDistantLight",
      "feDropShadow",
      "feFlood",
      "feFuncA",
      "feFuncB",
      "feFuncG",
      "feFuncR",
      "feGaussianBlur",
      "feImage",
      "feMerge",
      "feMergeNode",
      "feMorphology",
      "feOffset",
      "fePointLight",
      "feSpecularLighting",
      "feSpotLight",
      "feTile",
      "feTurbulence",
      "foreignObject",
      "glyphRef",
      "linearGradient",
      "radialGradient",
      "textPath",
    ].map((name) => [name.toLowerCase(), name]),
  );

  static #attributeNames = new Map(
    [
      "definitionURL",
      "attributeName",
      "attributeType",
      "baseFrequency",
      "baseProfile",
      "calcMode",
      "clipPathUnits",
      "diffuseConstant",
      "edgeMode",
      "filterUnits",
      "glyphRef",
      "gradientTransform",
      "gradientUnits",
      "kernelMatrix",
      "kernelUnitLength",
      "keyPoints",
      "keySplines",
      "keyTimes",
      "lengthAdjust",
      "limitingConeAngle",
      "markerHeight",
      "markerUnits",
      "markerWidth",
      "maskContentUnits",
      "maskUnits",
      "numOctaves",
      "pathLength",
      "patternContentUnits",
      "patternTransform",
      "patternUnits",
      "pointsAtX",
      "pointsAtY",
      "pointsAtZ",
      "preserveAlpha",
      "preserveAspectRatio",
      "primitiveUnits",
      "refX",
      "refY",
      "repeatCount",
      "repeatDur",
      "requiredExtensions",
      "requiredFeatures",
      "specularConstant",
      "specularExponent",
      "spreadMethod",
      "startOffset",
      "stdDeviation",
      "stitchTiles",
      "surfaceScale",
      "systemLanguage",
      "tableValues",
      "targetX",
      "targetY",
      "textLength",
      "viewBox",
      "viewTarget",
      "xChannelSelector",
      "yChannelSelector",
      "zoomAndPan",
    ].map((name) => [name.toLowerCase(), name]),
  );

  static render(
    node: AnyNode | ArrayLike<AnyNode>,
    options: XmlRenderer.Options = {},
  ): string {
    if (options.minify) return this.#renderCompact(node, options);

    const nodes = "length" in node ? node : [node];
    for (let index = 0; index < nodes.length; index++) {
      this.#sanitizeNode(nodes[index]!);
    }

    const rendererOptions = {
      xmlMode: true,
      encodeEntities: false,
      emptyAttrs: true,
      selfClosingTags: true,
      ...options,
    } satisfies XmlRenderer.Options;

    return this.#renderFormattedChildren(nodes, rendererOptions, 0, false);
  }

  static #renderCompact(
    node: AnyNode | ArrayLike<AnyNode>,
    options: XmlRenderer.Options,
  ): string {
    const nodes = "length" in node ? node : [node];
    const xmlMode = options.xmlMode ?? false;
    let output = "";

    for (let index = 0; index < nodes.length; index++) {
      output += this.#renderNode(nodes[index]!, options, xmlMode);
    }

    return output;
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

        const trimmed = data.trim();
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
      const data = preserveSpace ? node.data : node.data.trim();
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

    return `${preserveSpace ? "" : this.#indent(depth, options)}${this.#renderNode(
      node,
      options,
      true,
    )}`;
  }

  static #renderFormattedTag(
    element: Element,
    options: XmlRenderer.Options,
    depth: number,
    preserveSpace: boolean,
  ): string {
    const name = element.name;
    const prefix = preserveSpace ? "" : this.#indent(depth, options);
    const attributes = this.#formatAttributes(element.attribs, options, true);
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

  static #renderChildren(
    children: ArrayLike<AnyNode>,
    options: XmlRenderer.Options,
    xmlMode: boolean | "foreign",
  ): string {
    let output = "";
    for (let index = 0; index < children.length; index++) {
      output += this.#renderNode(children[index]!, options, xmlMode);
    }
    return output;
  }

  static #renderNode(
    node: AnyNode,
    options: XmlRenderer.Options,
    xmlMode: boolean | "foreign",
  ): string {
    switch (node.type) {
      case ElementType.Root:
        return this.#renderChildren(node.children, options, xmlMode);
      case ElementType.Directive:
        return `<${(node as ProcessingInstruction).data}>`;
      case ElementType.Comment:
        return `<!--${(node as Comment).data}-->`;
      case ElementType.CDATA:
        return `<![CDATA[${((node as CDATA).children[0] as Text).data}]]>`;
      case ElementType.Script:
      case ElementType.Style:
      case ElementType.Tag:
        return this.#renderTag(node as Element, options, xmlMode);
      case ElementType.Text: {
        const element = node as Text;
        const data = element.data || "";
        if (
          (options.encodeEntities ?? options.decodeEntities) !== false &&
          !(
            !xmlMode &&
            element.parent &&
            this.#unencodedElements.has((element.parent as Element).name)
          )
        ) {
          return (
            xmlMode || options.encodeEntities !== "utf8"
              ? encodeXML
              : escapeText
          )(data);
        }
        return data;
      }
    }
  }

  static #renderTag(
    element: Element,
    options: XmlRenderer.Options,
    xmlMode: boolean | "foreign",
  ): string {
    if (xmlMode === "foreign") {
      element.name = this.#elementNames.get(element.name) ?? element.name;
      if (
        element.parent &&
        this.#foreignModeIntegrationPoints.has((element.parent as Element).name)
      ) {
        xmlMode = false;
      }
    }

    if (!xmlMode && this.#foreignElements.has(element.name)) {
      xmlMode = "foreign";
    }

    const { name, children } = element;
    const isVoid = !xmlMode && this.#voidElements.has(name);
    let tag = `<${name}${this.#formatAttributes(element.attribs, options, xmlMode)}`;

    if (
      children.length === 0 &&
      (xmlMode
        ? options.selfClosingTags !== false
        : options.selfClosingTags && isVoid)
    ) {
      tag += xmlMode ? "/>" : " />";
    } else {
      tag += ">";
      if (children.length) {
        tag += this.#renderChildren(children, options, xmlMode);
      }
      if (!isVoid) tag += `</${name}>`;
    }

    return tag;
  }

  static #formatAttributes(
    attributes: Record<string, unknown> | undefined,
    options: XmlRenderer.Options,
    xmlMode: boolean | "foreign",
  ): string {
    if (!attributes) return "";

    const encode =
      (options.encodeEntities ?? options.decodeEntities) === false
        ? this.#replaceQuotes
        : xmlMode || options.encodeEntities !== "utf8"
          ? encodeXML
          : escapeAttribute;
    const isForeign = xmlMode === "foreign";
    const isShowEmpty = !!(options.emptyAttrs ?? xmlMode);
    let result = "";

    for (const key in attributes) {
      const value = attributes[key];
      const name = isForeign ? (this.#attributeNames.get(key) ?? key) : key;
      result +=
        !isShowEmpty && (value == null || value === "")
          ? ` ${name}`
          : ` ${name}="${encode(value == null ? "" : String(value))}"`;
    }

    return result;
  }

  static #sanitizeNode(node: AnyNode): void {
    if (isText(node)) {
      node.data = this.#sanitizeText(node.data);
    } else if (isTag(node)) {
      for (const [name, value] of Object.entries(node.attribs)) {
        node.attribs[name] = this.#sanitizeAttr(value);
      }
      for (const child of node.children) this.#sanitizeNode(child);
    }
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

  static #replaceQuotes(value: string): string {
    return value.replaceAll('"', "&quot;");
  }

  static #indent(depth: number, options: XmlRenderer.Options): string {
    return (options.indentation ?? "  ").repeat(depth);
  }
}
