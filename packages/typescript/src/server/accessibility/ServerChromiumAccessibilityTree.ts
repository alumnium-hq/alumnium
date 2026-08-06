import { always } from "alwaysly";
import { textContent } from "domutils";
import { pythonicId } from "../../pythonic/pythonicId.ts";
import { Xml } from "../../xml/Xml.ts";
import { XmlRenderer } from "../../xml/XmlRenderer.ts";
import { BaseServerAccessibilityTree } from "./BaseServerAccessibilityTree.ts";
import type { Tree } from "../../tree/Tree.ts";

export class ServerChromiumAccessibilityTree extends BaseServerAccessibilityTree {
  #tree: Record<string, Tree.Node> = {};

  constructor(xml: string) {
    super();

    const xmlRoots = Xml.parseAnyRootChildren(xml);

    for (const xmlRoot of xmlRoots) {
      const node = this.#xmlNodeToTreeNode(xmlRoot);
      // TODO: See `if (!xmlEl)` comment in the beginning of `#xmlNodeToTreeNode`.
      // if (!node) continue;
      const backendId = node.backendId ?? pythonicId(node);
      this.#tree[`${backendId}`] = node;
    }

    void this.devCaptureTreeInput("chrome", xml);
  }

  #xmlNodeToTreeNode(xmlNode: Xml.Node): Tree.Node {
    const xmlEl = Xml.nodeAsTag(xmlNode);
    // TODO: Having this check here doesn't affect the behavior, but it would
    // simplify the code quite a bit. It is present in `ServerUIAutomator2AccessibilityTree`.
    // if (!xmlEl) return null;
    const xmlText = Xml.nodeAsText(xmlNode);

    const simplifiedId = xmlEl ? this.getNextId() : (-1 as Tree.SimplifiedId);

    const rawId = xmlEl?.attribs.raw_id;
    if (rawId && simplifiedId !== -1) {
      const rawIdInt = parseInt(rawId) as Tree.RawId;
      this.simplifiedToRawId[simplifiedId] = rawIdInt;
    }

    const role = xmlEl?.tagName ?? (xmlText ? "StaticText" : undefined);
    always(role);

    const name = xmlEl?.attribs.name;

    const ignored = this.parseIgnored(xmlNode);

    const attrs: Tree.NodeAttrs = {};

    for (const [attrName, attrValue] of Object.entries(xmlEl?.attribs || {})) {
      if (skipXmlAttrs.has(attrName)) continue;
      attrs[attrName] = attrValue;
    }

    // Process children recursively

    const children: Tree.Node[] = [];

    for (const xmlChild of xmlEl?.children || []) {
      // TODO: This check is present in `ServerXCUITestAccessibilityTree`, but
      // wasn't in the original `ServerChromiumAccessibilityTree`. Adding it
      // here doesn't change the behavior, so we might want to keep it for
      // consistency.
      // if (!Xml.isTag(xmlChild)) continue;
      const childNode = this.#xmlNodeToTreeNode(xmlChild);
      // TODO: See `if (!xmlEl)` comment in the beginning of this function.
      // if (!childNode) continue;
      children.push(childNode);
    }

    const node: Tree.Node = {
      id: simplifiedId,
      role,
      name,
      ignored,
      attrs,
      children,
    };

    return node;
  }

  /**
   * Converts tree to XML string.
   *
   * @param excludeAttrs Optional set of attribute names to exclude from output.
   */
  override toXml(excludeAttrs: Set<string> = new Set()): string {
    function treeNodeToXmlElement(
      node: Tree.Node,
      xmlParent: Xml.Element | null,
    ): Xml.Element | null {
      const { id, role, ignored, name = "", attrs, children } = node;

      if (role === "StaticText" && xmlParent) {
        if (name.trim()) xmlParent.children.push(Xml.text(name));
        return null;
      }

      if (role === "none" || ignored) {
        for (const child of children) treeNodeToXmlElement(child, xmlParent);
        return null;
      }

      const isGeneric = role === "generic";

      // Create the XML element for the node
      const xmlEl = Xml.element(isGeneric ? "div" : role);

      if (!excludeAttrs.has("name") && name) xmlEl.attribs.name = name;

      // Assign a unique ID to the element
      if (!excludeAttrs.has("id")) xmlEl.attribs.id = String(id);

      for (const [attrName, attrValue] of Object.entries(attrs)) {
        if (!excludeAttrs.has(attrName)) xmlEl.attribs[attrName] = attrValue;
      }

      // Add children recursively
      for (const child of children) treeNodeToXmlElement(child, xmlEl);

      // Return root XML element
      if (!xmlParent) return xmlEl;

      // Trim redundant nodes

      const xmlElAttrs = new Set(Object.keys(xmlEl.attribs));
      const emptyAttrs =
        xmlElAttrs.size === 0 ||
        (xmlElAttrs.size === 1 && xmlElAttrs.has("id"));

      if (isGeneric) {
        // Collapse empty generic nodes with no children and no attrs except
        // for id.
        if (!xmlEl.children.length && emptyAttrs) return null;

        // Flatten generic nodes with a single child and no attributes except
        // for id.
        if (xmlEl.children.length === 1 && emptyAttrs) {
          const singleChild = xmlEl.children[0];
          always(singleChild);

          xmlParent.children.push(singleChild);
          return null;
        }
      }

      xmlParent.children.push(xmlEl);
      return null;
    }

    // Create the root XML element
    const xmlRoots: Xml.Element[] = [];
    for (const rootId of Object.keys(this.#tree)) {
      always(this.#tree[rootId]);

      const xmlRoot = treeNodeToXmlElement(this.#tree[rootId], null);

      if (xmlRoot) {
        xmlRoots.push(xmlRoot);
        this.#pruneRedundantName(xmlRoot);
      }
    }

    const xml = XmlRenderer.render(xmlRoots);
    void this.devCaptureTreeOutput(xml);

    return xml;
  }

  /**
   * Recursively traverses the tree, removes redundant name information from parent nodes,
   * and returns a list of all content (names) in the current subtree.
   */
  #pruneRedundantName(xmlChild: Xml.ChildNode): string[] {
    const xmlEl = Xml.nodeAsTag(xmlChild);

    // RootWebArea should remain untouched - only process children
    if (xmlEl?.tagName === "RootWebArea") {
      const descendantContent: string[] = [];
      for (const child of xmlEl.children) {
        descendantContent.push(...this.#pruneRedundantName(child));
      }
      return this.#getTexts(xmlEl).concat(descendantContent);
    }

    // Remove name if it equals text
    // TODO: This is incorrect, Python's `node.text` gives only direct text nodes,
    // while `textContent(node)` gives all descendant text.
    const nodeText = textContent(xmlChild);
    if (xmlEl?.attribs.name && nodeText && xmlEl.attribs.name === nodeText) {
      delete xmlEl.attribs.name;
    }

    if (!(xmlEl?.children || []).length) {
      return this.#getTexts(xmlChild);
    }

    // Recursively process children and gather all descendant content
    const descendantContent: string[] = [];
    for (const child of xmlEl?.children || []) {
      descendantContent.push(...this.#pruneRedundantName(child));
    }

    // Sort by length, longest first, to handle overlapping substrings correctly
    descendantContent.sort((left, right) => right.length - left.length);

    for (const content of descendantContent) {
      if (xmlEl?.attribs.name)
        xmlEl.attribs.name = xmlEl.attribs.name.replace(content, "").trim();

      if (xmlEl?.attribs.label)
        xmlEl.attribs.label = xmlEl.attribs.label.replace(content, "").trim();

      // TODO: Figure out how to handle that properly, trimming text nodes in
      // the middle of children list can lead to removing spaces and merging
      // words together. It is unclear what problem this solved in Python,
      // so it might as well be not needed at all.
      //     if node.text:
      //        node.text = node.text.replace(content, "").strip()
    }

    // The content of the current subtree is its own (potentially pruned) name
    // plus all the content from its descendants.
    const currentSubtreeContent = descendantContent;
    if (xmlEl?.attribs.name)
      currentSubtreeContent.push(...this.#getTexts(xmlChild));

    return currentSubtreeContent;
  }

  #getTexts(xmlChild: Xml.ChildNode): string[] {
    const texts = new Set<string>();
    const xmlEl = Xml.nodeAsTag(xmlChild);

    if (xmlEl?.attribs.name) texts.add(xmlEl.attribs.name);

    if (xmlEl?.attribs.label) texts.add(xmlEl.attribs.label);

    const xmlText = Xml.nodeAsText(xmlChild);
    if (xmlText) texts.add(xmlText.data);

    return Array.from(texts);
  }
}

const skipXmlAttrs = new Set([
  "backendDOMNodeId",
  "ignored",
  "name",
  "nodeId",
  "raw_id",
  // We skip 'expanded' because it often leads
  // to LLM decided to first click comboboxes to expand them,
  // which is automatically handled by the SelectTool.
  "expanded",
]);
