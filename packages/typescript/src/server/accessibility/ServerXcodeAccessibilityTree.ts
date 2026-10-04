import type { Tree } from "../../tree/Tree.ts";
import { Xml } from "../../xml/Xml.ts";
import { ServerXCUITestAccessibilityTree } from "./ServerXCUITestAccessibilityTree.ts";

/** Xcode shares XCTest's roles, but also reports selection, focus, and placeholder state. */
export class ServerXcodeAccessibilityTree extends ServerXCUITestAccessibilityTree {
  #tree: Tree.Node[];

  constructor(xml: string) {
    // Parse after this subclass's state-preservation settings have initialized.
    super("");
    this.#tree = Xml.parseRootChildren(xml)
      .filter(Xml.isTag)
      .map((node) => this.xmlNodeToTreeNode(node));
    void this.devCaptureTreeInput("xcode", xml);
  }

  override toXml(excludeAttrs: Set<string> = new Set()): string {
    const xml = this.renderXml(this.#tree, { excludeAttrs });
    void this.devCaptureTreeOutput(xml);
    return xml;
  }

  protected override parseRole(xmlTag: Xml.Tag): string {
    return xmlTag.tagName === "Other" ? "generic" : xmlTag.tagName;
  }

  protected override preserveFalseAttrs = new Set([
    "enabled",
    "selected",
    "focused",
  ]);

  protected override skipXmlAttr(
    role: string,
    name: string,
    value: string,
  ): boolean {
    if (
      [
        "selected",
        "focused",
        "placeholderValue",
        "remoteLeafPlaceholder",
      ].includes(name)
    )
      return false;
    return super.skipXmlAttr(role, name, value);
  }
}
