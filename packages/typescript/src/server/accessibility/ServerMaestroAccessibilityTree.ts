import { always } from "alwaysly";
import type { Tree } from "../../tree/Tree.ts";
import { Xml } from "../../xml/Xml.ts";
import { BaseServerAccessibilityTree } from "./BaseServerAccessibilityTree.ts";

export class ServerMaestroAccessibilityTree extends BaseServerAccessibilityTree {
  #tree: Tree.Node[] = [];

  constructor(xml: string) {
    super();

    this.#tree = this.#parseTree(xml);

    void this.devCaptureTreeInput("maestro", xml);
  }

  //#region Parsing

  #parseTree(xml: string): Tree.Node[] {
    const tree: Tree.Node[] = [];

    for (const xmlRoot of Xml.parseRootChildren(xml)) {
      const xmlRootTag = Xml.nodeAsTag(xmlRoot);
      if (!xmlRootTag) continue;

      // `MaestroAccessibilityTree` wraps Maestro's list of roots in a synthetic `<root>`.
      if (xmlRootTag.tagName === "root") {
        for (const xmlChild of xmlRootTag.children) {
          const xmlChildTag = Xml.nodeAsTag(xmlChild);
          if (xmlChildTag) tree.push(this.xmlNodeToTreeNode(xmlChildTag));
        }
        continue;
      }

      tree.push(this.xmlNodeToTreeNode(xmlRootTag));
    }

    return tree;
  }

  protected override parseRole(xmlTag: Xml.Tag): string {
    return xmlTag.tagName === "View" ? "generic" : xmlTag.tagName;
  }

  #textAttrs = new Set(["accessibilityText", "text", "value", "hintText"]);

  protected override parseName(
    _role: string,
    xmlTag: Xml.Tag,
  ): string | undefined {
    const { accessibilityText, text, value } = xmlTag.attribs;
    return (
      accessibilityText?.trim() || text?.trim() || value?.trim() || undefined
    );
  }

  protected override normalizeXmlAttr(
    attrName: string,
    attrValue: string,
  ): string {
    return this.#textAttrs.has(attrName) ? attrValue.trim() : attrValue;
  }

  #xmlAttrsToExtract = new Set([
    "accessibilityText",
    "hintText",
    "text",
    "value",
    "resource-id",
    "checked",
    "selected",
    "focused",
  ]);

  protected override skipXmlAttr(
    _role: string,
    attrName: string,
    _attrValue: string,
  ): boolean {
    return !this.#xmlAttrsToExtract.has(attrName);
  }

  //#endregion

  //#region Rendering

  /**
   * Converts tree to XML string.
   *
   * @param excludeAttrs Optional set of attribute names to exclude from output.
   */
  override toXml(excludeAttrs: Set<string> = new Set()): string {
    const xml = this.renderXml(this.#tree, { excludeAttrs });

    void this.devCaptureTreeOutput(xml);

    return xml;
  }

  protected override genericRoles = new Set(["generic", "Text"]);

  protected override redundantTextAttrs = new Set([
    "accessibilityText",
    "text",
    "value",
  ]);

  protected override deduplicateAttrs = new Set([
    "accessibilityText",
    "text",
    "value",
  ]);

  protected override preserveFalseAttrs = new Set(["checked", "selected"]);

  protected override textContentAttr(role: string): string | undefined {
    return role === "Text" ? "accessibilityText" : undefined;
  }

  /**
   * Collapses the wrapper-plus-duplicate-label pattern Maestro produces for iOS controls, where a
   * button reports its label on the outer node and again on an inner leaf.
   */
  protected override pruneBackendRedundantNodes(xmlTag: Xml.Tag): void {
    for (const child of xmlTag.children) {
      const childTag = Xml.nodeAsTag(child);
      if (childTag) this.pruneBackendRedundantNodes(childTag);
    }

    const label = xmlTag.attribs["accessibilityText"];
    if (!label || xmlTag.children.length !== 1) return;

    const onlyChild = xmlTag.children[0];
    always(onlyChild);
    const childTag = Xml.nodeAsTag(onlyChild);
    if (!childTag || !this.isGenericRole(childTag.tagName)) return;
    if (
      Object.keys(childTag.attribs).some(
        (attrName) => !this.genericAttrs.has(attrName),
      )
    )
      return;

    // Hoist the inner subtree, dropping the redundant wrapper level.
    xmlTag.children = childTag.children;
  }

  //#endregion
}
