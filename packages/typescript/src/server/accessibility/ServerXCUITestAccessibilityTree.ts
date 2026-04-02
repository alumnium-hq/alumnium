import { always } from "alwaysly";
import { Element, Text } from "domhandler";
import { Xml } from "../../Xml.ts";
import { BaseServerAccessibilityTree } from "./BaseServerAccessibilityTree.ts";

export class ServerXCUITestAccessibilityTree extends BaseServerAccessibilityTree {
  #tree: InternalNode | null;
  #idToNode: Record<number, InternalNode>;

  constructor(xmlString: string) {
    super();

    this.#tree = null;
    this.#idToNode = {}; // Maps simplified ID to Node

    let roots: Xml.Node[];
    try {
      roots = Xml.parseRootChildren(xmlString);
    } catch (error) {
      throw new Error(`Invalid XML string: ${error}`);
    }

    let appElement: Element | null = null;
    for (const root of roots) {
      const el = Xml.nodeAsTag(root);
      if (!el) continue;
      if (el.tagName === "AppiumAUT") {
        for (const child of el.children) {
          const childEl = Xml.nodeAsTag(child);
          if (childEl && childEl.tagName.startsWith("XCUIElementType")) {
            appElement = childEl;
            break;
          }
        }
        break;
      } else if (el.tagName.startsWith("XCUIElementType")) {
        appElement = el;
        break;
      }
    }

    if (!appElement) return;
    this.#tree = this.#parseElement(appElement);
  }

  #simplifyRole(xcuiType: string): string {
    const simple = xcuiType.replace(/^XCUIElementType/, "");
    return simple === "Other" ? "generic" : simple;
  }

  #parseElement(node: Xml.Node): InternalNode {
    const element = Xml.nodeAsTag(node);
    const text = Xml.nodeAsText(node);
    const simplifiedId = this.getNextId();

    const rawType =
      element?.attribs.type ??
      element?.tagName ??
      (text ? "StaticText" : undefined);
    always(rawType);
    const simplifiedRole = this.#simplifyRole(rawType);

    // Extract raw_id attribute
    const rawId = element?.attribs.raw_id ?? "";
    if (rawId) {
      const rawIdInt = parseInt(rawId);
      this.simplifiedToRawId[simplifiedId] = rawIdInt;
    }

    let nameValue = element?.attribs.name;
    if (!nameValue) {
      // Prefer label
      nameValue = element?.attribs.label;
    }
    if (!nameValue && simplifiedRole === "StaticText") {
      // For StaticText, value is often the content
      nameValue = element?.attribs.value;
    }
    if (!nameValue) {
      // Fallback if all else fails
      nameValue = "";
    }

    // An element is considered "ignored" if it's not accessible.
    // This aligns with ARIA principles where accessibility is key.
    const ignored = element?.attribs.ignored === "true";

    const properties: InternalNodeProperty[] = [];
    // Attributes to extract into the properties list
    // Order can matter for readability or consistency if ever serialized
    const propXmlAttrs = [
      "name",
      "label",
      "value", // Raw values
      "enabled",
      "visible",
      "accessible",
      "x",
      "y",
      "width",
      "height",
      "index",
    ];

    for (const xmlAttrName of propXmlAttrs) {
      if (element && xmlAttrName in element.attribs) {
        const attrValue = element.attribs[xmlAttrName] ?? "";
        // Use a distinct name for raw attributes in properties if they were used for main fields
        const propName = ["name", "label", "value"].includes(xmlAttrName)
          ? `${xmlAttrName}_raw`
          : xmlAttrName;

        const propEntry: InternalNodeProperty = { name: propName };

        if (["enabled", "visible", "accessible"].includes(xmlAttrName)) {
          propEntry.value = attrValue === "true";
        } else if (
          ["x", "y", "width", "height", "index"].includes(xmlAttrName)
        ) {
          const parsedInt = parseInt(attrValue);
          if (Number.isNaN(parsedInt)) {
            propEntry.value = attrValue;
          } else {
            propEntry.value = parsedInt;
          }
        } else {
          // Raw name, label, value
          propEntry.value = attrValue;
        }
        properties.push(propEntry);
      }
    }

    const internalNode: InternalNode = {
      id: simplifiedId,
      role: simplifiedRole,
      name: nameValue,
      ignored,
      properties,
      children: [],
    };

    this.#idToNode[simplifiedId] = internalNode;

    // TODO: It is better to use map to define children before creating the node.
    for (const childElement of element?.children || []) {
      const element = Xml.nodeAsTag(childElement);
      if (!element) continue;
      internalNode.children.push(this.#parseElement(element));
    }

    return internalNode;
  }

  /**
   * Converts the processed tree back to an XML string with filtering and flattening.
   *
   * @param excludeAttrs Optional set of attribute names to exclude from output.
   */
  toXml(excludeAttrs: Set<string> = new Set()): string {
    if (!this.#tree) {
      return "";
    }

    this.#pruneRedundantName(this.#tree);

    function convertDictToXml(node: InternalNode): Element | Text | null {
      // Filter out ignored elements
      if (node.ignored) {
        return null;
      }

      // Recursive flattening of deeply nested structures
      function findDeepestMeaningfulNode(
        currentNode: InternalNode,
      ): InternalNode {
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
        return convertDictToXml(flattenedNode);
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

      for (const prop of node.properties) {
        const pName = prop.name;
        const pValue = prop.value;

        if (pName === "label_raw") {
          rawLabelVal = pValue ? String(pValue) : null;
        } else if (pName === "value_raw") {
          rawValueVal = pValue ? String(pValue) : null;
        } else if (pName === "enabled") {
          if (pValue === false) {
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

      const element = new Element(tagName, xmlAttrs);

      // Add children recursively
      for (const childNode of node.children) {
        const childElement = convertDictToXml(childNode);
        if (childElement != null) {
          element.children.push(childElement);
        }
      }

      // Handle text content for StaticText
      if (tagName === "StaticText" && nameValue && !element.children.length) {
        element.children = [new Text(nameValue)];
        // Remove name attribute if it's now text, to avoid redundancy
        if ("name" in xmlAttrs && xmlAttrs.name === nameValue) {
          if ("name" in element.attribs) {
            delete element.attribs.name;
          }
        }
      }

      // Prune empty generic elements
      if (tagName === "generic") {
        let hasSignificantAttributes = false;
        if (element.attribs.name || element.attribs.value) {
          hasSignificantAttributes = true;
        }

        if (
          !hasSignificantAttributes &&
          // TODO: Find the equivalent of Python XML's `node.text`.
          // !element.text &&
          !element.children.length
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
        return convertDictToXml(flattenedNodeAgain);
      }

      return element;
    }

    const rootXmlElement = convertDictToXml(this.#tree);

    if (!rootXmlElement) {
      return ""; // Root itself was filtered out
    }

    const xmlString = Xml.format([rootXmlElement]);
    return xmlString;
  }

  /**
   * Recursively traverses the tree, removes redundant name information from parent nodes,
   * and returns a list of all content (names) in the current subtree.
   */
  #pruneRedundantName(node: InternalNode): string[] {
    if (!node.children.length) {
      return this.#getTexts(node);
    }

    // Recursively process children and gather all descendant content
    const descendantContent: string[] = [];
    // TODO: Better to use flatMap here.
    for (const child of node.children) {
      descendantContent.push(...this.#pruneRedundantName(child));
    }

    // Sort by length, longest first, to handle overlapping substrings correctly
    descendantContent.sort((left, right) => right.length - left.length);

    for (const content of descendantContent) {
      node.name = node.name.replace(content, "").trim();
      for (const prop of node.properties) {
        if (["name_raw", "label_raw", "value_raw"].includes(prop.name)) {
          const propValue = prop.value;
          always(typeof propValue === "string");
          prop.value = propValue.replace(content, "").trim();
        }
      }
    }

    // The content of the current subtree is its own (potentially pruned) name
    // plus all the content from its descendants.
    if (node.name) {
      descendantContent.push(...this.#getTexts(node));
    }

    return descendantContent;
  }

  #getTexts(node: InternalNode): string[] {
    const texts = new Set<string>();
    if (node.name) {
      texts.add(node.name);
    }
    for (const prop of node.properties) {
      if (["label_raw", "value_raw", "name_raw"].includes(prop.name)) {
        always(typeof prop.value === "string");
        texts.add(prop.value);
      }
    }

    return Array.from(texts);
  }
}

//#region Types

// TODO: Find a place for these types, as they might be shared between different
// modules or even defined in an external library.

/** A single accessibility node in the parsed hierarchy. */
interface InternalNode {
  id: number;
  role: string;
  name: string;
  ignored: boolean;
  properties: InternalNodeProperty[];
  children: InternalNode[];
}

interface InternalNodeProperty {
  name: string;
  value?: string | number | boolean;
}

//#endregion
