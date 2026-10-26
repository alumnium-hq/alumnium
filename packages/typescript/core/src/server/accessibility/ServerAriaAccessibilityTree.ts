import type { Tree } from "../../tree/Tree.ts";
import { Xml } from "../../xml/Xml.ts";
import { BaseServerAccessibilityTree } from "./BaseServerAccessibilityTree.ts";

/** Tree of ARIA snapshots computed in the page, used for non-Chromium browsers. */
export class ServerAriaAccessibilityTree extends BaseServerAccessibilityTree {
  #tree: Tree.Node[];

  constructor(xml: string) {
    super();

    this.#tree = Xml.parseAnyRootChildren(xml)
      .filter(Xml.isTag)
      .map((node) => this.xmlNodeToTreeNode(node));

    void this.devCaptureTreeInput("aria", xml);
  }

  //#region Parsing

  protected override parseRole(xmlTag: Xml.Tag): string {
    return xmlTag.tagName;
  }

  protected override parseName(
    _role: string,
    xmlTag: Xml.Tag,
  ): string | undefined {
    return xmlTag.attribs.name?.trim() || undefined;
  }

  #skipXmlAttrs = new Set(["name", "raw_id", "sharedId"]);

  protected override skipXmlAttr(
    _role: string,
    attrName: string,
    _attrValue: string,
  ): boolean {
    return this.#skipXmlAttrs.has(attrName);
  }

  protected override parseAddressable(xmlTag: Xml.Tag): boolean {
    return xmlTag.attribs.sharedId !== undefined;
  }

  //#endregion

  //#region Rendering

  override toXml(excludeAttrs: Set<string> = new Set()): string {
    const xml = this.renderXml(this.#tree, { excludeAttrs });

    void this.devCaptureTreeOutput(xml);

    return xml;
  }

  protected override genericRoles: Set<string> = new Set(["generic", "none"]);

  protected override inlineTextRoles = new Set(["text"]);

  protected override preserveNameRoles = new Set(["RootWebArea"]);

  protected override trimmingBorderRoles = new Set(["RootWebArea"]);

  protected override preserveFalseAttrs = new Set(["checked"]);

  protected override explicitTrueAttrs = new Set(["expanded"]);

  protected override textContentAttr(_role: string): string | undefined {
    return undefined;
  }

  // Keeps generic elements with only text, such as <div onclick>Add to cart</div>,
  // addressable rather than merging their text into the parent.
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

  //#endregion
}
