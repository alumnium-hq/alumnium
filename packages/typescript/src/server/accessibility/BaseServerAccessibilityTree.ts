import { always } from "alwaysly";
import { xxh64Str } from "smolxxh/str";
import { Env } from "../../Env.ts";
import { FileStore } from "../../FileStore/FileStore.ts";
import type { ToolCall } from "../../tools/BaseTool.ts";
import type { Tree } from "../../tree/Tree.ts";
import { Xml } from "../../xml/Xml.ts";
import { XmlRenderer } from "../../xml/XmlRenderer.ts";
import { textContent } from "domutils";

export abstract class BaseServerAccessibilityTree {
  //#region Id Mapping

  #simplifiedIdCounter = 0;

  protected simplifiedToRawId: Record<Tree.SimplifiedId, Tree.RawId> = {};

  getRawId(simplifiedIdArg: unknown): Tree.RawId {
    const simplifiedId = this.#extractId(simplifiedIdArg);
    const rawId = this.simplifiedToRawId[simplifiedId];
    if (typeof rawId !== "number") {
      throw new Error(`No element with simplified id=${simplifiedId}`);
    }

    return rawId;
  }

  // Gemini returns ids as floats
  // Llama sometimes returns ids as strings or nested dicts
  #extractId(id: unknown): Tree.SimplifiedId {
    if (typeof id === "number") {
      return Math.trunc(id) as Tree.SimplifiedId;
    } else if (typeof id === "string") {
      return +id as Tree.SimplifiedId;
    } else if (typeof id === "object" && id && "value" in id) {
      return this.#extractId(id.value);
    }

    throw new Error(`Cannot extract id from ${String(id)}`);
  }

  mapToolCallsToRawId(toolCalls: ToolCall[]): ToolCall[] {
    const mappedCalls: ToolCall[] = [];
    for (const call of toolCalls) {
      const mappedCall: ToolCall = { ...call };
      const args = { ...call.args };

      if ("id" in args) {
        args.id = this.getRawId(args.id);
      }
      if ("from_id" in args) {
        args.from_id = this.getRawId(args.from_id);
      }
      if ("to_id" in args) {
        args.to_id = this.getRawId(args.to_id);
      }

      mappedCall.args = args;
      mappedCalls.push(mappedCall);
    }

    return mappedCalls;
  }

  //#endregion

  //#region Parsing

  xmlNodeToTreeNode(xmlTag: Xml.Tag): Tree.Node {
    const simplifiedId = this.getNextId();

    const rawId = xmlTag.attribs.raw_id;
    if (rawId) {
      const rawIdInt = parseInt(rawId) as Tree.RawId;
      this.simplifiedToRawId[simplifiedId] = rawIdInt;
    }

    const role = this.parseRole(xmlTag);

    const attrs: Tree.NodeAttrs = {};
    for (const [attrName, attrValue] of Object.entries(xmlTag.attribs)) {
      const normalizedAttrValue = this.normalizeXmlAttr(attrName, attrValue);
      if (
        !normalizedAttrValue ||
        normalizedAttrValue === "false" ||
        this.skipXmlAttr(role, attrName, normalizedAttrValue)
      )
        continue;
      attrs[attrName] = normalizedAttrValue;
    }

    const children: Tree.Node[] = [];
    for (const xmlChild of xmlTag.children) {
      if (!Xml.isTag(xmlChild)) continue;
      children.push(this.xmlNodeToTreeNode(xmlChild));
    }

    return {
      id: simplifiedId,
      role,
      name: this.parseName(role, xmlTag),
      ignored: this.parseIgnored(xmlTag),
      attrs,
      children,
    };
  }

  protected getNextId(): Tree.SimplifiedId {
    this.#simplifiedIdCounter += 1;
    return this.#simplifiedIdCounter as Tree.SimplifiedId;
  }

  protected abstract parseRole(xmlTag: Xml.Tag): string;

  protected abstract parseName(
    role: string,
    xmlTag: Xml.Tag,
  ): string | undefined;

  protected abstract skipXmlAttr(
    role: string,
    attrName: string,
    attrValue: string,
  ): boolean;

  protected normalizeXmlAttr(_attrName: string, attrValue: string): string {
    return attrValue;
  }

  protected parseIgnored(xmlNode: Xml.Node): boolean {
    const xmlTag = Xml.nodeAsTag(xmlNode);
    // An element is considered "ignored" if it's not accessible.
    // This aligns with ARIA principles where accessibility is key.
    return xmlTag?.attribs.ignored === "true";
  }

  //#endregion

  //#region Rendering

  /**
   * Convert tree to XML string, optionally excluding specified attributes.
   */
  abstract toXml(excludeAttrs?: Set<string>): string;

  protected renderXml(
    roots: Tree.Node[],
    options: BaseServerAccessibilityTree.TreeToXmlOptions,
  ): string {
    const xmlRoots: Xml.Tag[] = [];

    for (const root of roots) {
      const xmlRoot = this.#treeNodeToXmlTag(root, null, options);
      if (!xmlRoot) continue;

      xmlRoots.push(xmlRoot);

      this.#pruneRedundantText(
        xmlRoot,
        this.redundantTextAttrs,
        this.preserveNameRoles,
      );

      this.pruneBackendRedundantNodes(xmlRoot);
      this.#trimGenericChildren(xmlRoot);
      this.#preserveTextAtTrimmingBorders(xmlRoot);
    }

    return XmlRenderer.render(xmlRoots);
  }

  #commonGenericRole = "div";

  protected genericRoles = new Set(["generic"]);

  protected inlineTextRoles = new Set<string>();

  protected ignoredRoles = new Set<string>();

  protected redundantTextAttrs = new Set(["name", "label"]);

  protected preserveNameRoles = new Set<string>();

  protected trimmingBorderRoles = new Set<string>();

  protected deduplicateAttrs = new Set<string>();

  protected abstract textContentAttr(role: string): string | undefined;

  protected shouldTrimEmptyGeneric(_xmlTag: Xml.Tag): boolean {
    return false;
  }

  protected shouldTrimEmptyNode(_xmlTag: Xml.Tag): boolean {
    return false;
  }

  protected pruneBackendRedundantNodes(_xmlTag: Xml.Tag): void {}

  #isGenericRole(role: string): boolean {
    return role === this.#commonGenericRole || this.genericRoles.has(role);
  }

  protected genericAttrs = new Set(["id"]);

  // Preserve source element boundaries when generic wrappers are unwrapped.
  #sourceIdsByRenderedNode = new WeakMap<
    Xml.Node,
    Tree.SimplifiedId | string
  >();

  #textPromotedTags = new WeakSet<Xml.Tag>();

  #isGenericAttr(attrName: string): boolean {
    return this.genericAttrs.has(attrName);
  }

  #hasNonGenericAttrs(xmlTag: Xml.Tag): boolean {
    const attrNames = Object.keys(xmlTag.attribs);
    return attrNames.some((attrName) => !this.#isGenericAttr(attrName));
  }

  #treeNodeToXmlTag(
    node: Tree.Node,
    xmlParent: Xml.Tag | null,
    options: BaseServerAccessibilityTree.TreeToXmlOptions,
  ): Xml.Tag | null {
    const { role, name = "", children } = node;
    const { excludeAttrs } = options;

    if (this.ignoredRoles.has(role)) return null;

    if (this.inlineTextRoles.has(role) && xmlParent) {
      if (name.trim()) {
        const text = Xml.text(name);
        if (!excludeAttrs.has("id"))
          this.#sourceIdsByRenderedNode.set(text, node.id);
        xmlParent.children.push(text);
      }
      return null;
    }

    const isGeneric = this.#isGenericRole(role);
    const tag = isGeneric ? this.#commonGenericRole : role;
    const xmlTag = Xml.tag(tag);

    if (!excludeAttrs.has("name") && name) xmlTag.attribs.name = name;

    if (!excludeAttrs.has("id")) xmlTag.attribs.id = String(node.id);

    for (const [attrName, attrValue] of Object.entries(node.attrs)) {
      if (!excludeAttrs.has(attrName)) xmlTag.attribs[attrName] = attrValue;
    }

    this.#removeDuplicateAttrs(xmlTag);

    for (const child of children)
      this.#treeNodeToXmlTag(child, xmlTag, options);

    const textContentAttr = this.textContentAttr(role);
    const textContentValue = textContentAttr
      ? node.attrs[textContentAttr]
      : undefined;
    if (textContentValue && !xmlTag.children.length) {
      const text = Xml.text(textContentValue);
      if (!excludeAttrs.has("id"))
        this.#sourceIdsByRenderedNode.set(text, node.id);
      xmlTag.children.push(text);
      this.#textPromotedTags.add(xmlTag);
      delete xmlTag.attribs[textContentAttr!];
    }

    if (!xmlParent) return xmlTag;

    const hasNonGenericAttrs = this.#hasNonGenericAttrs(xmlTag);

    if (isGeneric) {
      if (!xmlTag.children.length && !hasNonGenericAttrs) return null;

      if (
        xmlTag.children.length === 1 &&
        !hasNonGenericAttrs &&
        !this.#textPromotedTags.has(xmlTag)
      ) {
        const child = xmlTag.children[0];
        always(child);
        xmlParent.children.push(child);
        return null;
      }
    }

    xmlParent.children.push(xmlTag);
    return null;
  }

  #preserveTextAtTrimmingBorders(xmlTag: Xml.Tag): void {
    for (const child of xmlTag.children) {
      const childTag = Xml.nodeAsTag(child);
      if (childTag) this.#preserveTextAtTrimmingBorders(childTag);
    }

    if (!this.trimmingBorderRoles.has(xmlTag.tagName)) return;
    if (xmlTag.children.length !== 1) return;

    const child = xmlTag.children[0];
    const text = child && Xml.nodeAsText(child);
    if (!text) return;

    const sourceId = this.#sourceIdsByRenderedNode.get(child);
    if (!sourceId) return;

    xmlTag.children = [
      Xml.tag(this.#commonGenericRole, { id: String(sourceId) }, [text]),
    ];
  }

  #trimGenericChildren(xmlParent: Xml.Tag): void {
    const trimmedChildren = xmlParent.children.filter((xmlChild) => {
      const xmlTag = Xml.nodeAsTag(xmlChild);
      if (!xmlTag) return true;

      this.#trimGenericChildren(xmlTag);
      if (this.shouldTrimEmptyNode(xmlTag)) return false;
      return !(
        this.#isGenericRole(xmlTag.tagName) &&
        this.shouldTrimEmptyGeneric(xmlTag)
      );
    });
    const hasMultipleChildren = trimmedChildren.length > 1;
    const children = trimmedChildren.flatMap((xmlChild) => {
      const xmlTag = Xml.nodeAsTag(xmlChild);
      if (!xmlTag) return [xmlChild];

      if (!this.#isGenericRole(xmlTag.tagName)) return [xmlTag];

      const hasTextChild = xmlTag.children.some((child) =>
        Xml.nodeAsText(child),
      );
      const hasTagChild = xmlTag.children.some((child) => Xml.nodeAsTag(child));
      if (
        this.#hasNonGenericAttrs(xmlTag) ||
        hasMultipleChildren ||
        this.#textPromotedTags.has(xmlTag) ||
        (hasTextChild && hasTagChild)
      )
        return [xmlTag];

      const child = xmlTag.children[0];
      if (
        child &&
        xmlTag.attribs.id &&
        !this.#sourceIdsByRenderedNode.has(child)
      )
        this.#sourceIdsByRenderedNode.set(child, xmlTag.attribs.id);
      return xmlTag.children;
    });

    xmlParent.children = children.flatMap((child, index) => {
      const text = Xml.nodeAsText(child);
      if (!text) return [child];

      const previous = children[index - 1];
      const next = children[index + 1];
      const hasAdjacentText =
        (previous && Xml.nodeAsText(previous)) ||
        (next && Xml.nodeAsText(next));
      if (!hasAdjacentText) return [child];

      const id = this.#sourceIdsByRenderedNode.get(child);
      if (!id) return [child];
      return [Xml.tag(this.#commonGenericRole, { id: String(id) }, [text])];
    });
  }

  #removeDuplicateAttrs(xmlTag: Xml.Tag): void {
    const values = new Set<string>();
    const name = xmlTag.attribs.name;
    if (name) values.add(name);

    for (const attrName of this.deduplicateAttrs) {
      const attrValue = xmlTag.attribs[attrName];
      if (!attrValue) continue;
      if (values.has(attrValue)) delete xmlTag.attribs[attrName];
      else values.add(attrValue);
    }
  }

  #pruneRedundantText(
    xmlNode: Xml.ChildNode,
    textAttrs: Set<string>,
    preserveNameRoles: Set<string>,
  ): string[] {
    const xmlTag = Xml.nodeAsTag(xmlNode);

    if (xmlTag && preserveNameRoles.has(xmlTag.tagName)) {
      const descendantContent = xmlTag.children.flatMap((child) =>
        this.#pruneRedundantText(child, textAttrs, preserveNameRoles),
      );

      return this.#getTexts(xmlNode, textAttrs).concat(descendantContent);
    }

    const nodeText = textContent(xmlNode);
    if (xmlTag?.attribs.name && nodeText && xmlTag.attribs.name === nodeText)
      delete xmlTag.attribs.name;

    if (!xmlTag?.children.length) return this.#getTexts(xmlNode, textAttrs);

    const descendantContent = xmlTag.children.flatMap((child) =>
      this.#pruneRedundantText(child, textAttrs, preserveNameRoles),
    );
    descendantContent.sort((left, right) => right.length - left.length);

    for (const content of descendantContent) {
      for (const attrName of textAttrs) {
        const attrValue = xmlTag.attribs[attrName];
        if (!attrValue) continue;

        const prunedValue = attrValue.replace(content, "").trim();
        if (prunedValue) xmlTag.attribs[attrName] = prunedValue;
        else delete xmlTag.attribs[attrName];
      }
    }

    if (xmlTag.attribs.name)
      descendantContent.push(...this.#getTexts(xmlNode, textAttrs));

    return descendantContent;
  }

  #getTexts(xmlNode: Xml.ChildNode, textAttrs: Set<string>): string[] {
    const texts = new Set<string>();
    const xmlTag = Xml.nodeAsTag(xmlNode);

    for (const attrName of textAttrs) {
      const value = xmlTag?.attribs[attrName];
      if (value) texts.add(value);
    }

    const xmlText = Xml.nodeAsText(xmlNode);
    if (xmlText) texts.add(xmlText.data);

    return Array.from(texts);
  }

  //#endregion

  //#region Dev

  static #devTreesStore = FileStore.subStore(undefined, "dev", "trees");

  #devCapturedTreeName?: string;

  protected async devCaptureTreeInput(
    kind: string,
    xml: string,
  ): Promise<void> {
    if (!Env.ALUMNIUM_DEV_CAPTURE_TREES) return;

    const hash = xxh64Str(xml);
    this.#devCapturedTreeName = `${kind}-${hash}`;
    await this.#devWriteTree("in", xml);
  }

  protected async devCaptureTreeOutput(xml: string): Promise<void> {
    if (!Env.ALUMNIUM_DEV_CAPTURE_TREES) return;

    await this.#devWriteTree("out", xml);
  }

  async #devWriteTree(inOut: "in" | "out", xml: string): Promise<void> {
    always(this.#devCapturedTreeName);
    const name = `${this.#devCapturedTreeName}-${inOut}.xml`;
    await BaseServerAccessibilityTree.#devTreesStore.writeFile(name, xml);
  }

  //#endregion
}

export namespace BaseServerAccessibilityTree {
  export interface TreeToXmlOptions {
    excludeAttrs: Set<string>;
  }
}
