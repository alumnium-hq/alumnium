import { always } from "alwaysly";
import { BaseServerAccessibilityTree } from "./baseServerAccessibilityTree.ts";

export class ServerXcuitestAccessibilityTree extends BaseServerAccessibilityTree {
  #tree: Node | null;
  #idToNode: Record<number, Node>;

  constructor(xmlString: string) {
    super();
    this.#tree = null; // Will hold the root node of the processed tree
    this.#idToNode = {}; // Maps simplified ID to Node

    let rootElement: ElementLike;
    try {
      // @ts-expect-error -- TODO: Missing Python API
      rootElement = fromstring(xmlString);
    } catch (error) {
      throw new Error(`Invalid XML string: ${error}`);
    }

    let appElement: ElementLike | null = null;
    if (rootElement.tag === "AppiumAUT") {
      const rootChildren = Array.from(rootElement);
      if (rootChildren.length) {
        always(rootChildren[0]);
        appElement = rootChildren[0];
      } else {
        this.#tree = null;
        return;
      }
    } else if (rootElement.tag.startsWith("XCUIElementType")) {
      appElement = rootElement;
    } else {
      this.#tree = null;
      return;
    }

    // TODO: Python code assumes appElement can be None, but that's not true, so else branch can be removed.
    if (appElement) {
      this.#tree = this.#parseElement(appElement);
    } else {
      this.#tree = null;
    }
  }

  #simplifyRole(xcuiType: string): string {
    const simple = xcuiType.replace(/^XCUIElementType/, "");
    return simple === "Other" ? "generic" : simple;
  }

  #parseElement(element: ElementLike): Node {
    const simplifiedId = this.getNextId();
    const attributes = element.attrib;

    const rawType = attributes.type ?? element.tag;
    const simplifiedRole = this.#simplifyRole(rawType);

    // Extract raw_id attribute
    const rawId = attributes.raw_id ?? "";
    if (rawId) {
      const rawIdInt = parseInt(rawId);
      this.simplifiedToRawId[simplifiedId] = rawIdInt;
    }

    let nameValue = attributes.name;
    if (!nameValue) {
      // Prefer label
      nameValue = attributes.label;
    }
    if (!nameValue && simplifiedRole === "StaticText") {
      // For StaticText, value is often the content
      nameValue = attributes.value;
    }
    if (!nameValue) {
      // Fallback if all else fails
      nameValue = "";
    }

    // An element is considered "ignored" if it's not accessible.
    // This aligns with ARIA principles where accessibility is key.
    const ignored = attributes.ignored === "true";

    const properties: NodeProperty[] = [];
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
      if (xmlAttrName in attributes) {
        const attrValue = attributes[xmlAttrName] ?? "";
        // Use a distinct name for raw attributes in properties if they were used for main fields
        const propName = ["name", "label", "value"].includes(xmlAttrName)
          ? `${xmlAttrName}_raw`
          : xmlAttrName;

        const propEntry: NodeProperty = { name: propName };

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

    const node: Node = {
      id: simplifiedId,
      role: simplifiedRole,
      name: nameValue,
      ignored,
      properties,
      children: [],
    };

    this.#idToNode[simplifiedId] = node;

    // TODO: It is better to use map to define children before creating the node.
    for (const childElement of element) {
      node.children.push(this.#parseElement(childElement));
    }

    return node;
  }

  /**
   * Converts the processed tree back to an XML string with filtering and flattening.
   *
   * @param excludeAttrs Optional set of attribute names to exclude from output.
   */
  override toXml(excludeAttrs: Set<string> = new Set()): string {
    const tree = this.#tree;
    if (!tree) {
      return "";
    }

    this.#pruneRedundantName(tree);

    function convertDictToXml(node: Node): ElementLike | null {
      // Filter out ignored elements
      if (node.ignored) {
        return null;
      }

      // Recursive flattening of deeply nested structures
      function findDeepestMeaningfulNode(currentNode: Node): Node {
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

      // @ts-expect-error -- TODO: Missing Python API
      const element: ElementLike = Element(tagName, xmlAttrs);

      // Add children recursively
      for (const childNode of node.children) {
        const childElement = convertDictToXml(childNode);
        if (childElement != null) {
          element.append(childElement);
        }
      }

      // Handle text content for StaticText
      if (
        tagName === "StaticText" &&
        nameValue &&
        !Array.from(element).length
      ) {
        element.text = nameValue;
        // Remove name attribute if it's now text, to avoid redundancy
        if ("name" in xmlAttrs && xmlAttrs.name === nameValue) {
          if ("name" in element.attrib) {
            delete element.attrib.name;
          }
        }
      }

      // Prune empty generic elements
      if (tagName === "generic") {
        let hasSignificantAttributes = false;
        if (element.attrib.name || element.attrib.value) {
          hasSignificantAttributes = true;
        }

        if (
          !hasSignificantAttributes &&
          !element.text &&
          !Array.from(element).length
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

    const rootXmlElement = convertDictToXml(tree);

    if (!rootXmlElement) {
      return ""; // Root itself was filtered out
    }

    // @ts-expect-error -- TODO: Missing Python API
    indent(rootXmlElement);
    // @ts-expect-error -- TODO: Missing Python API
    const xmlString: string = tostring(rootXmlElement, { encoding: "unicode" });
    return xmlString;
  }

  /**
   * Recursively traverses the tree, removes redundant name information from parent nodes,
   * and returns a list of all content (names) in the current subtree.
   */
  #pruneRedundantName(node: Node): string[] {
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
    // TODO: Redundant variable, can use descendantContent directly.
    const currentSubtreeContent = descendantContent;
    if (node.name) {
      currentSubtreeContent.push(...this.#getTexts(node));
    }

    return currentSubtreeContent;
  }

  #getTexts(node: Node): string[] {
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

// TODO: Apparently this function is not used in Python at all. Remove if when confirmed.
function isNodeVisible(node: Node): boolean {
  for (const prop of node.properties) {
    if (prop.name === "visible") {
      // TODO: Python have here `bool(prop.get("value"))` which apparently only returns True if the value is exactly True.
      // Verify if this is the intended behavior and if we need to handle boolean strings or other types as well.
      return prop.value === true;
    }
  }
  return true;
}

//#region Scaffold Types

// TODO: Get rid of these in favor of the XML library types

/** A single accessibility node in the parsed hierarchy. */
interface Node {
  id: number;
  role: string;
  name: string;
  ignored: boolean;
  properties: NodeProperty[];
  children: Node[];
}

interface NodeProperty {
  name: string;
  value?: string | number | boolean;
}

interface ElementLike {
  tag: string;
  attrib: Record<string, string>;
  text?: string;
  get(name: string, defaultValue?: string): string;
  append(child: ElementLike): void;
  [Symbol.iterator](): Iterator<ElementLike>;
}

//#endregion
