import { Xml } from "../../xml/Xml.ts";
import { BaseServerAccessibilityTree } from "./BaseServerAccessibilityTree.ts";
import type { Tree } from "../../tree/Tree.ts";
import { always } from "alwaysly";

export class ServerXCUITestAccessibilityTree extends BaseServerAccessibilityTree {
  #tree: Tree.Node[] = [];

  constructor(xml: string) {
    super();

    this.#tree = this.#parseTree(xml);

    void this.devCaptureTreeInput("xcuitest", xml);
  }

  //#region Parsing

  #parseTree(xml: string): Tree.Node[] {
    const xmlAppTag = this.#findXmlAppTag(Xml.parseRootChildren(xml));
    if (!xmlAppTag) return [];

    return [this.xmlNodeToTreeNode(xmlAppTag)];
  }

  #findXmlAppTag(xmlRoots: Xml.Node[]): Xml.Tag | null {
    for (const xmlRoot of xmlRoots) {
      const xmlRootTag = Xml.nodeAsTag(xmlRoot);
      if (!xmlRootTag) continue;

      if (xmlRootTag.tagName === "AppiumAUT") {
        for (const xmlChild of xmlRootTag.children) {
          const xmlRootChild = Xml.nodeAsTag(xmlChild);
          if (xmlRootChild?.tagName.startsWith("XCUIElementType"))
            return xmlRootChild;
        }
        return null;
      }

      if (xmlRootTag.tagName.startsWith("XCUIElementType")) return xmlRootTag;
    }
    return null;
  }

  protected override parseRole(xmlTag: Xml.Tag): string {
    const xcuiType = xmlTag.attribs.type ?? xmlTag.tagName;
    const simple = xcuiType.replace(/^XCUIElementType/, "");
    return simple === "Other" ? "generic" : simple;
  }

  #textAttrs = new Set(["name", "label", "value"]);

  protected override parseName(
    role: string,
    xmlTag: Xml.Tag,
  ): string | undefined {
    const { name, label, value } = xmlTag.attribs;
    const trimmedName = name?.trim();
    const trimmedLabel = label?.trim();
    if (role === "StaticText" && trimmedLabel) return trimmedLabel;
    if (trimmedName) return trimmedName;
    if (trimmedLabel) return trimmedLabel;
    const trimmedValue = value?.trim();
    if (role === "StaticText" && trimmedValue) return trimmedValue;
    return undefined;
  }

  protected override normalizeXmlAttr(
    attrName: string,
    attrValue: string,
  ): string {
    return this.#textAttrs.has(attrName) ? attrValue.trim() : attrValue;
  }

  #xmlAttrsToExtract = new Set(["label", "value", "enabled"]);

  protected override skipXmlAttr(
    role: string,
    attrName: string,
    attrValue: string,
  ): boolean {
    if (role === "StaticText" && attrName === "name") return false;
    if (!this.#xmlAttrsToExtract.has(attrName)) return true;
    if (attrName === "enabled" && attrValue === "true") return true;
    return false;
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

  override genericRoles = new Set(["generic", "StaticText"]);

  protected override redundantTextAttrs = new Set(["name", "label", "value"]);

  protected override deduplicateAttrs = new Set(["label", "value"]);

  protected override textContentAttr(role: string): string | undefined {
    return role === "StaticText" ? "label" : undefined;
  }

  protected override pruneBackendRedundantNodes(xmlTag: Xml.Tag): void {
    for (const child of xmlTag.children) {
      const childTag = Xml.nodeAsTag(child);
      if (childTag) this.pruneBackendRedundantNodes(childTag);
    }

    if (xmlTag.children.length !== 1) return;
    const onlyChild = xmlTag.children[0];
    always(onlyChild);
    const childTag = Xml.nodeAsTag(onlyChild);
    if (!childTag || childTag.tagName !== "div") return;
    if (Object.keys(childTag.attribs).some((attrName) => attrName !== "id"))
      return;
    if (childTag.children.length !== 1) return;

    const onlyGrandchild = childTag.children[0];
    always(onlyGrandchild);
    const childText = Xml.nodeAsText(onlyGrandchild);
    if (!childText) return;
    const parentName = xmlTag.attribs.name;
    if (parentName && parentName !== childText.data) return;

    delete xmlTag.attribs.name;
    xmlTag.children = [childText];
  }

  //#endregion
}
