import { always } from "alwaysly";
import { Xml } from "../../xml/Xml.ts";
import { BaseServerAccessibilityTree } from "./BaseServerAccessibilityTree.ts";
import type { Tree } from "../../tree/Tree.ts";

export class ServerUIAutomator2AccessibilityTree extends BaseServerAccessibilityTree {
  #tree: Tree.Node[] = [];

  constructor(xml: string) {
    super();

    this.#tree = this.#parseTree(xml);

    void this.devCaptureTreeInput("uiautomator2", xml);
  }

  //#region Parsing

  #parseTree(xml: string): Tree.Node[] {
    const tree: Tree.Node[] = [];

    const xmlRoots = Xml.parseMultirootChildren(this.#cleanXml(xml));

    for (const xmlRoot of xmlRoots) {
      const xmlRootTag = Xml.nodeAsTag(xmlRoot);
      always(xmlRootTag);

      for (const xmlContainer of xmlRootTag.children) {
        if (!Xml.isTag(xmlContainer)) continue;
        const container = this.xmlNodeToTreeNode(xmlContainer);
        tree.push(container);
        // tree.push(...this.#unwrapContainers(container));
      }
    }

    return tree;
  }

  #unwrapContainers(node: Tree.Node): Tree.Node[] {
    if (node.role !== "root" && node.role !== "hierarchy") return [node];
    return node.children.flatMap((child) => this.#unwrapContainers(child));
  }

  #cleanXml(xml: string): string {
    const xmlDeclarationPattern = /^\s*<\?xml.*\?>\s*$/;
    return xml
      .split("\n")
      .filter((line) => !xmlDeclarationPattern.test(line))
      .join("\n");
  }

  #genericRoles = new Set([
    "FrameLayout",
    "LinearLayout",
    "LinearLayoutCompat",
    "RelativeLayout",
    "ViewGroup",
  ]);

  protected override parseRole(xmlTag: Xml.Tag): string {
    const role = xmlTag.attribs.type ?? xmlTag.tagName;
    const simplifiedRole = role.split(".").at(-1);
    always(simplifiedRole);
    return this.#genericRoles.has(simplifiedRole) ? "generic" : simplifiedRole;
  }

  protected override parseName(
    _role: string,
    _xmlTag: Xml.Tag,
  ): string | undefined {
    return undefined;
  }

  #resourceIdSeparator = ":id/";

  protected override normalizeXmlAttr(
    attrName: string,
    attrValue: string,
  ): string {
    if (attrName === "text") return attrValue.trim();
    if (attrName === "resource-id") {
      const resourceName = attrValue.split(this.#resourceIdSeparator)[1];
      return resourceName || attrValue;
    }
    return attrValue;
  }

  #xmlAttrsToExtract = new Set([
    "resource-id",
    "content-desc",
    "text",
    "clickable",
    "checked",
  ]);

  protected override skipXmlAttr(
    role: string,
    attrName: string,
    _attrValue: string,
  ): boolean {
    if (!this.#xmlAttrsToExtract.has(attrName)) return true;
    if (role !== "CheckBox" && attrName === "checked") return true;
    return false;
  }

  //#endregion

  //#region Rendering

  /**
   * Convert tree to XML string.
   *
   * @param excludeAttrs Optional set of attribute names to exclude from output.
   */
  override toXml(excludeAttrs: Set<string> = new Set()): string {
    const xml = this.renderXml(this.#tree, { excludeAttrs });

    void this.devCaptureTreeOutput(xml);

    return xml;
  }

  protected override genericRoles = new Set([
    "generic",
    "root",
    "hierarchy",
    "TextView",
    "View",
  ]);

  protected override genericAttrs = new Set(["id", "resource-id"]);

  protected override textContentAttr(_role: string): string | undefined {
    return "text";
  }

  #textViewGenericAttrs = new Set(["id", "resource-id"]);

  protected override pruneBackendRedundantNodes(xmlTag: Xml.Tag): void {
    for (const child of xmlTag.children) {
      const childTag = Xml.nodeAsTag(child);
      if (childTag) this.pruneBackendRedundantNodes(childTag);
    }

    const contentDescription = xmlTag.attribs["content-desc"];
    if (!contentDescription) return;

    xmlTag.children = xmlTag.children.filter((child) => {
      const childTag = Xml.nodeAsTag(child);
      const childText = childTag?.children[0]
        ? Xml.nodeAsText(childTag.children[0])
        : null;
      return !(
        childTag?.tagName === "div" &&
        childText?.data === contentDescription &&
        childTag.children.length === 1 &&
        Object.keys(childTag.attribs).every((attrName) =>
          this.#textViewGenericAttrs.has(attrName),
        )
      );
    });
  }

  //#endregion
}
