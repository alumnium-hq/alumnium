import { always } from "alwaysly";
import { textContent } from "domutils";
import { pythonicId } from "../../pythonic/pythonicId.ts";
import { Xml } from "../../Xml.ts";
import { BaseServerAccessibilityTree } from "./BaseServerAccessibilityTree.ts";
import type { Tree } from "../../tree/Tree.ts";

export class ServerChromiumAccessibilityTree extends BaseServerAccessibilityTree {
  #skipAttrs = new Set([
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

  #tree: Record<string, Tree.Node>;

  constructor(xml: string) {
    super();
    this.#tree = {}; // Initialize the result dictionary

    // Parse the raw XML
    const xmlRoots = Xml.parseAnyRootChildren(xml);

    // Process each root element
    for (const xmlRoot of xmlRoots) {
      const node = this.#xmlNodeToTreeNode(xmlRoot);
      // Use backendId as the key
      const backendId = node.backendId ?? pythonicId(node);
      this.#tree[`${backendId}`] = node;
    }

    void this.devCaptureTreeInput("chrome", xml);
  }

  /** Convert XML element to node dict structure with simplified IDs. */
  #xmlNodeToTreeNode(xmlNode: Xml.Node): Tree.Node {
    const xmlEl = Xml.nodeAsTag(xmlNode);
    const text = Xml.nodeAsText(xmlNode);

    // Assign simplified ID
    const simplifiedId = xmlEl ? this.getNextId() : -1;

    // Map to raw_id attribute
    const rawId = xmlEl?.attribs["raw_id"] ?? "";
    if (rawId) {
      this.simplifiedToRawId[simplifiedId] = parseInt(rawId);
    }

    const role = xmlEl?.tagName ?? (text ? "StaticText" : undefined);
    always(role);

    const node: Tree.Node = {
      id: simplifiedId,
      role,
      // NOTE: In Python implementation we had "True"/"False" strings, so we use
      // case-insensitive comparison here to be safe.
      ignored: xmlEl?.attribs["ignored"]?.toLowerCase() === "true",
    };

    // Add name if present
    if (xmlEl?.attribs["name"]) node.name = xmlEl.attribs["name"];

    // Add properties from other attributes
    const attrs: Tree.Attr[] = [];
    for (const [name, value] of Object.entries(xmlEl?.attribs || {})) {
      if (this.#skipAttrs.has(name)) continue;
      attrs.push({ name, value });
    }

    if (attrs.length) node.attrs = attrs;

    // Process children recursively
    const xmlChildren = Xml.nodeAsNodeWithChildren(xmlNode)?.children || [];
    const children: Tree.Node[] = [];
    for (const xmlChild of xmlChildren) {
      const child = this.#xmlNodeToTreeNode(xmlChild);
      children.push(child);
    }

    if (children.length) node.children = children;

    return node;
  }

  /**
   * Converts the nested tree to XML format using role.value as tags.
   *
   * @param excludeAttrs Optional set of attribute names to exclude from output.
   */
  override toXml(excludeAttrs: Set<string> = new Set()): string {
    function treeNodeToXmlNode(
      node: Tree.Node,
      xmlParent: Xml.Element | null,
    ): Xml.Element | null {
      const { id, role, ignored, name = "", attrs = [], children = [] } = node;

      if (role === "StaticText" && xmlParent) {
        xmlParent.children.push(Xml.text(name));
        return null;
      }

      if (role === "none" || ignored) {
        for (const child of children) treeNodeToXmlNode(child, xmlParent);
        return null;
      }

      if (role === "generic" && !children.length) return null;

      // Create the XML element for the node
      const xmlEl = Xml.element(role);

      if (!excludeAttrs.has("name") && name) xmlEl.attribs.name = name;

      // Assign a unique ID to the element
      if (!excludeAttrs.has("id")) xmlEl.attribs.id = String(id);

      for (const attr of attrs) {
        const attrName = attr.name;
        if (!excludeAttrs.has(attrName))
          xmlEl.attribs[attrName] = attr.value ?? "";
      }

      // Add children recursively
      for (const child of children) treeNodeToXmlNode(child, xmlEl);

      if (xmlParent) xmlParent.children.push(xmlEl);

      return xmlEl;
    }

    // Create the root XML element
    const xmlRoots: Xml.Element[] = [];
    for (const rootId of Object.keys(this.#tree)) {
      always(this.#tree[rootId]);

      const xmlRoot = treeNodeToXmlNode(this.#tree[rootId], null);

      if (xmlRoot) {
        xmlRoots.push(xmlRoot);
        this.#pruneRedundantName(xmlRoot);
      }
    }

    const xml = Xml.format(xmlRoots);
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

    const text = Xml.nodeAsText(xmlChild);
    if (text) texts.add(text.data);

    return Array.from(texts);
  }
}
