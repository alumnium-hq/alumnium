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
      tree.push(this.xmlNodeToTreeNode(xmlRoot));
    }

    return tree;
  }

  protected override parseRole(xmlTag: Xml.Tag): string {
    return xmlTag.tagName;
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

  protected override inlineTextRoles = new Set(["StaticText"]);

  protected override ignoredRoles = new Set(["InlineTextBox"]);

  protected override preserveNameRoles = new Set(["RootWebArea"]);

  protected override trimmingBorderRoles = new Set(["RootWebArea"]);

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

  //#endregion
}
