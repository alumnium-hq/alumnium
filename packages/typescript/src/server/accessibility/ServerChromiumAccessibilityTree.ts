import { Xml } from "../../xml/Xml.ts";
import { BaseServerAccessibilityTree } from "./BaseServerAccessibilityTree.ts";
import type { Tree } from "../../tree/Tree.ts";

export class ServerChromiumAccessibilityTree extends BaseServerAccessibilityTree {
  #tree: Tree.Node[] = [];

  constructor(xml: string) {
    super();

    this.#tree = this.#parseTree(xml);

    void this.devCaptureTreeInput("chrome", xml);
  }

  //#region Parsing

  #parseTree(xml: string): Tree.Node[] {
    const tree: Tree.Node[] = [];

    const xmlRoots = Xml.parseAnyRootChildren(xml);

    for (const xmlRoot of xmlRoots) {
      if (!Xml.isTag(xmlRoot)) continue;
      if (this.skipXmlNode(xmlRoot)) continue;
      tree.push(this.xmlNodeToTreeNode(xmlRoot));
    }

    return tree;
  }

  protected override parseRole(xmlTag: Xml.Tag): string {
    return xmlTag.tagName;
  }

  protected override skipXmlNode(xmlTag: Xml.Tag): boolean {
    return xmlTag.tagName === "InlineTextBox";
  }

  protected override parseName(
    _role: string,
    xmlTag: Xml.Tag,
  ): string | undefined {
    return xmlTag.attribs.name?.trim() || undefined;
  }

  #skipXmlAttrs = new Set([
    "backendDOMNodeId",
    "ignored",
    "name",
    "nodeId",
    "raw_id",
    "mutable",
    // We skip 'expanded' because it often leads LLMs to click comboboxes
    // before selecting, which is automatically handled by the SelectTool.
    "expanded",
  ]);

  protected override skipXmlAttr(
    _role: string,
    attrName: string,
    _attrValue: string,
  ): boolean {
    return this.#skipXmlAttrs.has(attrName);
  }

  protected override parseAddressable(xmlTag: Xml.Tag): boolean {
    return xmlTag.attribs.backendDOMNodeId !== undefined;
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

  protected override genericRoles: Set<string> = new Set(["generic", "none"]);

  protected override inlineTextRoles = new Set(["ListMarker", "StaticText"]);

  protected override unwrappedUnaddressableRoles = new Set(["MenuListPopup"]);

  protected override preserveNameRoles = new Set(["RootWebArea"]);

  protected override trimmingBorderRoles = new Set(["RootWebArea"]);

  protected override trimmingBorderChildRoles = new Set(["generic"]);

  protected override preserveFalseAttrs = new Set(["checked"]);

  protected override textContentAttr(_role: string): string | undefined {
    return undefined;
  }

  #liveRegionAttrs = new Set(["atomic", "live", "relevant"]);

  protected override shouldTrimEmptyGeneric(xmlTag: Xml.Tag): boolean {
    const attrNames = Object.keys(xmlTag.attribs).filter(
      (attrName) => attrName !== "id",
    );
    return (
      !xmlTag.children.length &&
      attrNames.length > 0 &&
      attrNames.every((attrName) => this.#liveRegionAttrs.has(attrName))
    );
  }

  protected override shouldPreserveTextOnlyGeneric(
    xmlTag: Xml.Tag,
    xmlParent: Xml.Tag,
  ): boolean {
    return (
      xmlTag.tagName === "generic" &&
      this.isGenericRole(xmlParent.tagName) &&
      this.isRenderedAddressable(xmlTag) &&
      xmlTag.children.length === 1 &&
      !!Xml.nodeAsText(xmlTag.children[0]!)
    );
  }

  protected override pruneBackendRedundantNodes(xmlTag: Xml.Tag): void {
    for (const child of xmlTag.children) {
      const childTag = Xml.nodeAsTag(child);
      if (childTag) this.pruneBackendRedundantNodes(childTag);
    }

    if (!("editable" in xmlTag.attribs || "settable" in xmlTag.attribs)) return;

    xmlTag.children = xmlTag.children.flatMap((child) => {
      const childTag = Xml.nodeAsTag(child);
      if (!childTag || !this.isGenericRole(childTag.tagName)) return [child];

      const attrs = Object.keys(childTag.attribs).filter(
        (attrName) => attrName !== "id" && attrName !== "editable",
      );
      const keep =
        attrs.length > 0 ||
        childTag.attribs.editable !== xmlTag.attribs.editable;
      if (keep) return [childTag];
      if (!this.isRenderedAddressable(childTag)) return childTag.children;
      return childTag.children.length ? [childTag] : [];
    });
  }

  //#endregion
}
