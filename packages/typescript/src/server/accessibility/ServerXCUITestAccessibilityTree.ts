import { always } from "alwaysly";
import { Xml } from "../../Xml.ts";
import { BaseServerAccessibilityTree } from "./BaseServerAccessibilityTree.ts";
import type { Tree } from "../../tree/Tree.ts";

export class ServerXCUITestAccessibilityTree extends BaseServerAccessibilityTree {
  #tree: Tree.Node | null = null;

  constructor(xml: string) {
    super();

    const xmlRoots: Xml.Node[] = Xml.parseRootChildren(xml);

    const xmlAppEl = this.#findXmlAppElement(xmlRoots);
    if (!xmlAppEl) return;

    this.#tree = this.#xmlNodeToTreeNode(xmlAppEl);

    void this.devCaptureTreeInput("xcuitest", xml);
  }

  #findXmlAppElement(xmlRoots: Xml.Node[]): Xml.Element | null {
    for (const xmlRoot of xmlRoots) {
      const xmlRootEl = Xml.nodeAsTag(xmlRoot);
      if (!xmlRootEl) continue;

      if (xmlRootEl.tagName === "AppiumAUT") {
        for (const xmlChild of xmlRootEl.children) {
          const xmlRootChild = Xml.nodeAsTag(xmlChild);
          if (xmlRootChild?.tagName.startsWith("XCUIElementType"))
            return xmlRootChild;
        }
        return null;
      } else if (xmlRootEl.tagName.startsWith("XCUIElementType")) {
        return xmlRootEl;
      }
    }
    return null;
  }

  #xmlNodeToTreeNode(xmlNode: Xml.Node): Tree.Node {
    const xmlEl = Xml.nodeAsTag(xmlNode);
    // TODO: Having this check here doesn't affect the behavior, but it would
    // simplify the code quite a bit. It is present in `ServerUIAutomator2AccessibilityTree`.
    // if (!xmlEl) return null;
    const xmlText = Xml.nodeAsText(xmlNode);

    const simplifiedId = this.getNextId();

    const rawId = xmlEl?.attribs.raw_id ?? "";
    if (rawId) {
      const rawIdInt = parseInt(rawId) as Tree.RawId;
      this.simplifiedToRawId[simplifiedId] = rawIdInt;
    }

    const role = this.#parseRole(xmlEl, xmlText);

    const name = this.#parseName(role, xmlEl);

    const ignored = this.parseIgnored(xmlNode);

    const attrs: Tree.NodeAttrs = {};

    for (const attrName of xmlAttrsToExtract) {
      if (xmlEl && attrName in xmlEl.attribs) {
        // Use a distinct name for raw attributes in properties if they were
        // used for main fields
        const processedAttrName = xmlAttrsAsRaw.has(attrName)
          ? `${attrName}_raw`
          : attrName;
        const attrValue = xmlEl.attribs[attrName] ?? "";

        attrs[processedAttrName] = attrValue;
      }
    }

    // Process children recursively

    const children: Tree.Node[] = [];

    for (const xmlChild of xmlEl?.children || []) {
      if (!Xml.isTag(xmlChild)) continue;
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

  #parseName(role: string, xmlEl: Xml.Element | null): string {
    const { name, label, value } = xmlEl?.attribs || {};
    if (name) return name;
    if (label) return label;
    if (role === "StaticText" && value) return value;
    return "";
  }

  #parseRole(xmlEl: Xml.Element | null, xmlText: Xml.Text | null): string {
    const xcuiType =
      xmlEl?.attribs.type ??
      xmlEl?.tagName ??
      (xmlText ? "StaticText" : undefined);
    always(xcuiType);

    return this.#xcuiTypeToRole(xcuiType);
  }

  #xcuiTypeToRole(xcuiType: string): string {
    const simple = xcuiType.replace(/^XCUIElementType/, "");
    return simple === "Other" ? "generic" : simple;
  }

  /**
   * Converts tree to XML string.
   *
   * @param excludeAttrs Optional set of attribute names to exclude from output.
   */
  override toXml(excludeAttrs: Set<string> = new Set()): string {
    if (!this.#tree) return "";

    function treeNodeToXmlElement(node: Tree.Node): Xml.AnyElement | null {
      // Filter out ignored elements
      if (node.ignored) return null;

      // Recursive flattening of deeply nested structures
      function findDeepestMeaningfulNode(currentNode: Tree.Node): Tree.Node {
        const validChildren = currentNode.children.filter((n) => !n.ignored);

        // If generic with only one child and same name, go deeper
        if (currentNode.role === "generic" && validChildren.length === 1) {
          always(validChildren[0]);
          const child = validChildren[0];
          const parentName = currentNode.name;
          const childName = child.name;

          // If names match exactly or parent contains the entire child name
          if (parentName === childName) {
            return findDeepestMeaningfulNode(child);
          } else if (childName === "") {
            child.name = parentName;
            return findDeepestMeaningfulNode(child);
          }
        }

        // Return current node if no more flattening possible
        return currentNode;
      }

      // Get the deepest meaningful node after flattening
      const flattenedNode = findDeepestMeaningfulNode(node);
      if (flattenedNode !== node) {
        // If we flattened, process the flattened node instead
        return treeNodeToXmlElement(flattenedNode);
      }

      // Use role as the tag name directly
      const tagName = node.role || "generic";

      const xmlAttrs: Record<string, string> = {};
      if (!excludeAttrs.has("id")) {
        xmlAttrs.id = String(node.id);
      }
      // Add name (as 'name' attribute) from the 'name' field if present
      const nameValue = node.name; // Used for StaticText handling later
      if (node.name && !excludeAttrs.has("name")) {
        // if node.name is not an empty string
        xmlAttrs.name = node.name;
      }

      // Extract raw label, raw value, and enabled status from properties
      let rawLabelVal: string | null = null;
      let rawValueVal: string | null = null;
      let isEnabled = true; // Assume true unless "enabled: false" is found

      for (const [attrName, attrValue] of Object.entries(node.attrs)) {
        if (attrName === "label_raw") {
          rawLabelVal = attrValue ? String(attrValue) : null;
        } else if (attrName === "value_raw") {
          rawValueVal = attrValue ? String(attrValue) : null;
        } else if (attrName === "enabled") {
          if (attrValue === "false") {
            // 'enabled' property in Node is boolean
            isEnabled = false;
          }
        }
      }

      const currentNameAttrVal = xmlAttrs.name;

      // Add 'label' attribute if raw_label_val exists and is different from current_name_attr_val
      if (
        rawLabelVal != null &&
        rawLabelVal !== currentNameAttrVal &&
        !excludeAttrs.has("label")
      ) {
        xmlAttrs.label = rawLabelVal;
      }

      // Add 'value' attribute if raw_value_val exists and is different from:
      // 1. current_name_attr_val (the name attribute value)
      // 2. The value of the 'label' attribute (if 'label' was added)
      if (rawValueVal != null && !excludeAttrs.has("value")) {
        let addValueAttr = true;
        if (rawValueVal === currentNameAttrVal) {
          addValueAttr = false;
        }

        // Check against the label attribute *if it was added*
        if ("label" in xmlAttrs && rawValueVal === xmlAttrs.label) {
          addValueAttr = false;
        }

        if (addValueAttr) {
          xmlAttrs.value = rawValueVal;
        }
      }

      // Add 'enabled="false"' if not enabled
      if (!isEnabled && !excludeAttrs.has("enabled")) {
        xmlAttrs.enabled = "false";
      }

      const xmlEl = Xml.element(tagName, xmlAttrs);

      // Add children recursively
      for (const childNode of node.children) {
        const childElement = treeNodeToXmlElement(childNode);
        if (childElement != null) {
          xmlEl.children.push(childElement);
        }
      }

      // Handle text content for StaticText
      if (tagName === "StaticText" && nameValue && !xmlEl.children.length) {
        xmlEl.children = [Xml.text(nameValue)];
        // Remove name attribute if it's now text, to avoid redundancy
        if ("name" in xmlAttrs && xmlAttrs.name === nameValue) {
          if ("name" in xmlEl.attribs) {
            delete xmlEl.attribs.name;
          }
        }
      }

      // Prune empty generic elements
      if (tagName === "generic") {
        let hasSignificantAttributes = false;
        if (xmlEl.attribs.name || xmlEl.attribs.value) {
          hasSignificantAttributes = true;
        }

        if (
          !hasSignificantAttributes &&
          // TODO: Find the equivalent of Python XML's `node.text`.
          // !element.text &&
          !xmlEl.children.length
        ) {
          return null;
        }
      }

      // Get the deepest meaningful node after flattening
      const flattenedNodeAgain = findDeepestMeaningfulNode(node);
      if (flattenedNodeAgain !== node) {
        // If we flattened, process the flattened node instead
        // We need to re-evaluate the element based on the flattened_node
        // This is a recursive call, ensure it doesn't lead to infinite loops
        // if the flattening logic isn't strictly reductive.
        return treeNodeToXmlElement(flattenedNodeAgain);
      }

      return xmlEl;
    }

    this.#pruneRedundantName(this.#tree);

    const rootXmlEl = treeNodeToXmlElement(this.#tree);

    // Root itself was filtered out
    if (!rootXmlEl) return "";

    const xml = Xml.format([rootXmlEl]);
    void this.devCaptureTreeOutput(xml);

    return xml;
  }

  /**
   * Recursively traverses the tree, removes redundant name information from parent nodes,
   * and returns a list of all content (names) in the current subtree.
   */
  #pruneRedundantName(node: Tree.Node): string[] {
    if (!node.children.length) return this.#getTexts(node);

    // Recursively process children and gather all descendant content
    const descendantContent: string[] = [];
    // TODO: Better to use flatMap here.
    for (const child of node.children) {
      descendantContent.push(...this.#pruneRedundantName(child));
    }

    // Sort by length, longest first, to handle overlapping substrings correctly
    descendantContent.sort((left, right) => right.length - left.length);

    for (const content of descendantContent) {
      node.name = node.name?.replace(content, "").trim();
      for (const [attrName, attrValue] of Object.entries(node.attrs)) {
        if (!rawAttrs.has(attrName)) continue;
        node.attrs[attrName] = attrValue.replace(content, "").trim();
      }
    }

    // The content of the current subtree is its own (potentially pruned) name
    // plus all the content from its descendants.
    if (node.name) {
      descendantContent.push(...this.#getTexts(node));
    }

    return descendantContent;
  }

  #getTexts(node: Tree.Node): string[] {
    const texts = new Set<string>();

    if (node.name) texts.add(node.name);

    for (const [attrName, attrValue] of Object.entries(node.attrs)) {
      if (!rawAttrs.has(attrName)) continue;
      texts.add(attrValue);
    }

    return Array.from(texts);
  }
}

const xmlAttrsToExtract = [
  "name",
  "label",
  "value",
  "enabled",
  "visible",
  "accessible",
  "x",
  "y",
  "width",
  "height",
  "index",
];

const xmlAttrsAsRaw = new Set(["name", "label", "value"]);

const rawAttrs = new Set([...xmlAttrsAsRaw].map((attr) => `${attr}_raw`));
