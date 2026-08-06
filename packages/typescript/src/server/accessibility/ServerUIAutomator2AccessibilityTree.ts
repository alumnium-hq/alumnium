import { always } from "alwaysly";
import { Xml } from "../../xml/Xml.ts";
import { XmlRenderer } from "../../xml/XmlRenderer.ts";
import { BaseServerAccessibilityTree } from "./BaseServerAccessibilityTree.ts";
import type { Tree } from "../../tree/Tree.ts";

export class ServerUIAutomator2AccessibilityTree extends BaseServerAccessibilityTree {
  #tree: Tree.Node[] = [];

  constructor(xml: string) {
    super();

    const xmlRoots = Xml.parseMultirootChildren(this.#cleanXml(xml));

    for (const xmlRoot of xmlRoots) {
      const xmlRootEl = Xml.nodeAsTag(xmlRoot);
      always(xmlRootEl);

      for (const xmlAppEl of xmlRootEl.children) {
        const node = this.#xmlNodeToTreeNode(xmlAppEl);
        if (node) this.#tree.push(node);
      }
    }

    void this.devCaptureTreeInput("uiautomator2", xml);
  }

  #cleanXml(xml: string): string {
    // cleaning multiple xml declaration lines from page source
    const xmlDeclarationPattern = /^\s*<\?xml.*\?>\s*$/;
    const lines = xml.split("\n");
    const cleanedLines = lines.filter(
      (line) => !xmlDeclarationPattern.test(line),
    );
    const cleanedXml = cleanedLines.join("\n");
    return cleanedXml;
  }

  #xmlNodeToTreeNode(xmlNode: Xml.Node): Tree.Node | null {
    const xmlEl = Xml.nodeAsTag(xmlNode);
    // NOTE: In Python's XML implementation, non-element nodes (like text nodes)
    // aren't available as children of an element, so simply ignoring them here.
    if (!xmlEl) return null;

    const simplifiedId = this.getNextId();

    // Extract raw_id attribute
    const rawId = xmlEl.attribs.raw_id;
    if (rawId) {
      const rawIdInt = parseInt(rawId) as Tree.RawId;
      this.simplifiedToRawId[simplifiedId] = rawIdInt;
    }

    const role = xmlEl.attribs.type ?? xmlEl.tagName;

    const ignored = this.parseIgnored(xmlNode);

    const attrs: Tree.NodeAttrs = {};

    for (const attrName of xmlAttrsToExtract) {
      const value = xmlEl.attribs[attrName];
      if (!value) continue;
      attrs[attrName] = value;
    }

    // Ignore checked for non-checkbox roles, as it can be misleading in
    // the context of other roles.
    const simplifiedRole = this.#simplifyRole(role);
    if (simplifiedRole !== "CheckBox") delete attrs.checked;

    // Process children recursively

    const children: Tree.Node[] = [];

    for (const xmlChild of xmlEl.children) {
      // TODO: This check is present in ServerXCUITestAccessibilityTree, but
      // wasn't in the original ServerUIAutomator2AccessibilityTree. Adding it
      // here doesn't change the behavior, so we might want to keep it for
      // consistency.
      // if (!Xml.isTag(xmlChild)) continue;
      const childNode = this.#xmlNodeToTreeNode(xmlChild);
      if (childNode) children.push(childNode);
    }

    const node: Tree.Node = {
      id: simplifiedId,
      role,
      ignored,
      attrs,
      children,
    };

    return node;
  }

  /**
   * Convert tree to XML string.
   *
   * @param excludeAttrs Optional set of attribute names to exclude from output.
   */
  override toXml(excludeAttrs: Set<string> = new Set()): string {
    if (!this.#tree.length) return "";

    const treeNodeToXmlElement = (
      node: Tree.Node,
      xmlParent: Xml.Element,
    ): Xml.Element | null => {
      if (node.ignored) return null;

      for (const child of node.children) {
        const { id } = child;

        const simplifiedRole = this.#simplifyRole(child.role);
        const xmlEl = Xml.element(simplifiedRole);

        if (!excludeAttrs.has("id")) xmlEl.attribs.id = String(id);

        for (const attrName of attrsToSerialize) {
          if (excludeAttrs.has(attrName) || !child.attrs[attrName]) continue;
          xmlEl.attribs[attrName] = child.attrs[attrName];
        }

        xmlParent.children.push(xmlEl);

        if (child.children.length) treeNodeToXmlElement(child, xmlEl);
      }

      return xmlParent;
    };

    const rootXmlEl = Xml.element("hierarchy");
    for (const node of this.#tree) treeNodeToXmlElement(node, rootXmlEl);

    const xml = XmlRenderer.render([rootXmlEl]);
    void this.devCaptureTreeOutput(xml);

    return xml;
  }

  #simplifyRole(role: string): string {
    const simplifiedRole = role.split(".").at(-1);
    always(simplifiedRole);
    return simplifiedRole;
  }
}

// TODO: The commented-out attributes were present in the original code but
// never serialized. They might be useful, but currently redundant.
const xmlAttrsToExtract = [
  // "class",
  // "index",
  // "width",
  // "height",
  "text",
  "resource-id",
  "content-desc",
  // "bounds",
  // "checkable",
  "checked",
  "clickable",
  // "displayed",
  // "enabled",
  // "focus",
  // "focused",
  // "focusable",
  // "long-clickable",
  // "password",
  // "selected",
  // "scrollable",
];

const attrsToSerialize = [
  "resource-id",
  "content-desc",
  "text",
  "clickable",
  "checked",
];
