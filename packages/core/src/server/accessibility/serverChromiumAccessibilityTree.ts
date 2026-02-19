import { always } from "alwaysly";
import { id } from "zod/v4/locales";
import { BaseServerAccessibilityTree } from "./baseServerAccessibilityTree.ts";

export class ServerChromiumAccessibilityTree extends BaseServerAccessibilityTree {
  readonly SKIPPED_PROPERTIES = new Set([
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

  tree: Record<string, ChromiumNode>;

  constructor(rawXml: string) {
    super();
    this.tree = {}; // Initialize the result dictionary

    // Parse the raw XML
    let roots: ElementLike[];
    try {
      // @ts-expect-error -- TODO: Missing Python API
      const root: ElementLike = fromstring(rawXml);
      roots = [root];
    } catch {
      // Multiple root elements
      // @ts-expect-error -- TODO: Missing Python API
      const wrapper: ElementLike = fromstring(`<root>${rawXml}</root>`);
      roots = Array.from(wrapper);
    }

    // Process each root element
    for (const rootElem of roots) {
      const node = this.#xmlToNode(rootElem);
      // Use backendDOMNodeId as the key
      const nodeId =
        node.backendDOMNodeId ??
        // @ts-expect-error -- TODO: Missing Python API
        id(node);
      this.tree[`${nodeId}`] = node;
    }
  }

  /** Convert XML element to node dict structure with simplified IDs. */
  #xmlToNode(elem: ElementLike): ChromiumNode {
    // Assign simplified ID
    const simplifiedId = this.getNextId();

    // Map to raw_id attribute
    const rawId = elem.get("raw_id", "");
    if (rawId) {
      this.simplifiedToRawId[simplifiedId] = parseInt(rawId);
    }

    const node: ChromiumNode = {
      id: simplifiedId,
      role: { value: elem.tag },
      // TODO: Check if "ignored" attribute is actually "True"/"False" or "true"/"false" in practice and adjust accordingly.
      ignored: elem.get("ignored", "False") === "True",
    };

    // Add name if present
    if (elem.get("name")) {
      node.name = { value: elem.get("name") };
    }

    // Add properties from other attributes
    const properties: ChromiumNodeProperty[] = [];
    for (const [attrName, attrValue] of Object.entries(elem.attrib)) {
      if (!this.SKIPPED_PROPERTIES.has(attrName)) {
        properties.push({
          name: attrName,
          value: { value: attrValue },
        });
      }
    }

    if (properties.length) {
      node.properties = properties;
    }

    // Process children recursively
    const children: ChromiumNode[] = [];
    for (const childElem of elem) {
      const childNode = this.#xmlToNode(childElem);
      children.push(childNode);
    }

    if (children.length) {
      node.nodes = children;
    }

    return node;
  }

  /**
   * Converts the nested tree to XML format using role.value as tags.
   *
   * @param excludeAttrs Optional set of attribute names to exclude from output.
   */
  override toXml(excludeAttrs: Set<string> = new Set()): string {
    function convertNodeToXml(
      node: ChromiumNode,
      parent: ElementLike | null = null,
    ): ElementLike | null {
      // Extract the desired information
      const roleValue = node.role.value;
      const nodeId = node.id ?? "";
      const ignored = node.ignored ?? false;
      const nameValue = node.name?.value ?? "";
      const properties = node.properties ?? [];
      const children = node.nodes ?? [];

      if (roleValue === "StaticText" && parent) {
        if (parent.text) {
          parent.text += nameValue;
        } else {
          parent.text = nameValue;
        }
      } else if (roleValue === "none" || ignored) {
        if (children.length > 0) {
          for (const child of children) {
            convertNodeToXml(child, parent);
          }
        }
      } else if (roleValue === "generic" && !children.length) {
        return null;
      } else {
        // Create the XML element for the node
        // @ts-expect-error -- TODO: Missing Python API
        const xmlElement: ElementLike = Element(roleValue);

        if (nameValue && !excludeAttrs.has("name")) {
          xmlElement.set("name", nameValue);
        }

        // Assign a unique ID to the element
        if (!excludeAttrs.has("id")) {
          xmlElement.set("id", String(nodeId));
        }

        // TODO: Redundant check
        if (properties.length) {
          for (const property of properties) {
            const propName = property.name;
            if (!excludeAttrs.has(propName)) {
              xmlElement.set(propName, property.value.value ?? "");
            }
          }
        }

        // Add children recursively
        // TODO: Redundant check
        if (children.length) {
          for (const child of children) {
            convertNodeToXml(child, xmlElement);
          }
        }

        if (parent) {
          parent.append(xmlElement);
        }

        return xmlElement;
      }

      return null;
    }

    // Create the root XML element
    const rootElements: ElementLike[] = [];
    for (const rootId of Object.keys(this.tree)) {
      always(this.tree[rootId]);
      const element = convertNodeToXml(this.tree[rootId]);
      if (element) {
        rootElements.push(element);
        this.#pruneRedundantName(element);
      }
    }

    // Convert the XML elements to a string
    let xmlString = "";
    for (const element of rootElements) {
      // @ts-expect-error -- TODO: Missing Python API
      indent(element);
      // @ts-expect-error -- TODO: Missing Python API
      xmlString += tostring(element, { encoding: "unicode" });
    }

    return xmlString;
  }

  /**
   * Recursively traverses the tree, removes redundant name information from parent nodes,
   * and returns a list of all content (names) in the current subtree.
   */
  #pruneRedundantName(node: ElementLike): string[] {
    // RootWebArea should remain untouched - only process children
    if (node.tag === "RootWebArea") {
      const descendantContent: string[] = [];
      for (const child of node) {
        descendantContent.push(...this.#pruneRedundantName(child));
      }
      return this.#getTexts(node).concat(descendantContent);
    }

    // Remove name if it equals text
    if (node.get("name") && node.text && node.get("name") === node.text) {
      delete node.attrib.name;
    }

    if (!Array.from(node).length) {
      return this.#getTexts(node);
    }

    // Recursively process children and gather all descendant content
    const descendantContent: string[] = [];
    for (const child of node) {
      descendantContent.push(...this.#pruneRedundantName(child));
    }

    // Sort by length, longest first, to handle overlapping substrings correctly
    descendantContent.sort((left, right) => right.length - left.length);

    for (const content of descendantContent) {
      if (node.get("name")) {
        node.set("name", node.get("name").replace(content, "").trim());
      }
      if (node.get("label")) {
        node.set("label", node.get("label").replace(content, "").trim());
      }
      if (node.text) {
        node.text = node.text.replace(content, "").trim();
      }
    }

    // The content of the current subtree is its own (potentially pruned) name
    // plus all the content from its descendants.
    const currentSubtreeContent = descendantContent;
    if (node.get("name")) {
      currentSubtreeContent.push(...this.#getTexts(node));
    }

    return currentSubtreeContent;
  }

  #getTexts(node: ElementLike): string[] {
    const texts = new Set<string>();
    if (node.get("name")) {
      texts.add(node.get("name"));
    }
    if (node.get("label")) {
      texts.add(node.get("label"));
    }
    if (node.text) {
      texts.add(node.text);
    }

    return Array.from(texts);
  }
}

//#region Scaffold Types

interface ChromiumNodeProperty {
  name: string;
  value: {
    value: string;
  };
}

interface ChromiumNode {
  id: number;
  role: {
    value: string;
  };
  ignored: boolean;
  name?: {
    value: string;
  };
  properties?: ChromiumNodeProperty[];
  nodes?: ChromiumNode[];
  backendDOMNodeId?: string | number;
}

interface ElementLike {
  tag: string;
  attrib: Record<string, string>;
  text?: string;
  get(name: string, defaultValue?: string): string;
  set(name: string, value: string): void;
  append(child: ElementLike): void;
  [Symbol.iterator](): Iterator<ElementLike>;
}

//#endregion
