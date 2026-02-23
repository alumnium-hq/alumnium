import { always } from "alwaysly";
import { render } from "dom-serializer";
import {
  ChildNode,
  Element,
  hasChildren,
  isTag,
  isText,
  Node,
  NodeWithChildren,
  Text,
} from "domhandler";
import { textContent } from "domutils";
import { parseDocument } from "htmlparser2";
import { "default" as xmlFormatter } from "xml-formatter";
import { pythonicId } from "../../pythonic/pythonicId.ts";
import { BaseServerAccessibilityTree } from "./BaseServerAccessibilityTree.ts";

// NOTE: xml-formatter has busted types, so we need to cast it manually.
const xmlFormat: (typeof xmlFormatter)["default"] = xmlFormatter as any;

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
    let roots: Node[];
    try {
      const root = parseDocument(rawXml.trim(), { xmlMode: true });
      roots = root.children;
    } catch {
      // Multiple root elements
      const wrapper = parseDocument(`<root>${rawXml.trim()}</root>`, {
        xmlMode: true,
      });
      roots = wrapper.children;
    }

    // Process each root element
    for (const rootElem of roots) {
      const node = this.#xmlToNode(rootElem);
      // Use backendDOMNodeId as the key
      const nodeId = node.backendDOMNodeId ?? pythonicId(node);
      this.tree[`${nodeId}`] = node;
    }
  }

  /** Convert XML element to node dict structure with simplified IDs. */
  #xmlToNode(node: Node): ChromiumNode {
    const elem = asTag(node);
    const text = asText(node);

    // Assign simplified ID
    const simplifiedId = elem ? this.getNextId() : -1;

    // Map to raw_id attribute
    const rawId = elem?.attribs["raw_id"] ?? "";
    if (rawId) {
      this.simplifiedToRawId[simplifiedId] = parseInt(rawId);
    }

    const role = elem?.tagName ?? (text ? "StaticText" : undefined);
    always(role);

    const chromiumNode: ChromiumNode = {
      id: simplifiedId,
      role: { value: role },
      // NOTE: In Python implementation we had "True"/"False" strings, so we use
      // case-insensitive comparison here to be safe.
      ignored: elem?.attribs["ignored"]?.toLowerCase() === "true",
    };

    // Add name if present
    if (elem?.attribs["name"]) {
      chromiumNode.name = { value: elem.attribs["name"] };
    }

    // Add properties from other attributes
    const properties: ChromiumNodeProperty[] = [];
    for (const [attrName, attrValue] of Object.entries(elem?.attribs || {})) {
      if (!this.SKIPPED_PROPERTIES.has(attrName)) {
        properties.push({
          name: attrName,
          value: { value: attrValue },
        });
      }
    }

    if (properties.length) {
      chromiumNode.properties = properties;
    }

    // Process children recursively
    const nodeChildren = asNodeWithChildren(node)?.children || [];
    const children: ChromiumNode[] = [];
    for (const childElem of nodeChildren) {
      const childNode = this.#xmlToNode(childElem);
      children.push(childNode);
    }

    if (children.length) {
      chromiumNode.nodes = children;
    }

    return chromiumNode;
  }

  /**
   * Converts the nested tree to XML format using role.value as tags.
   *
   * @param excludeAttrs Optional set of attribute names to exclude from output.
   */
  override toXml(excludeAttrs: Set<string> = new Set()): string {
    function convertNodeToXml(
      node: ChromiumNode,
      parent: Element | null = null,
    ): Element | null {
      // Extract the desired information
      const roleValue = node.role.value;
      const nodeId = node.id ?? "";
      const ignored = node.ignored ?? false;
      const nameValue = node.name?.value ?? "";
      const properties = node.properties ?? [];
      const children = node.nodes ?? [];

      if (roleValue === "StaticText" && parent) {
        parent.children.push(new Text(nameValue));
      } else if (roleValue === "none" || ignored) {
        if (children.length) {
          for (const child of children) {
            convertNodeToXml(child, parent);
          }
        }
      } else if (roleValue === "generic" && !children.length) {
        return null;
      } else {
        // Create the XML element for the node
        const xmlElement = new Element(roleValue, {});

        if (nameValue && !excludeAttrs.has("name")) {
          xmlElement.attribs.name = nameValue;
        }

        // Assign a unique ID to the element
        if (!excludeAttrs.has("id")) {
          xmlElement.attribs.id = String(nodeId);
        }

        for (const property of properties) {
          const propName = property.name;
          if (!excludeAttrs.has(propName)) {
            xmlElement.attribs[propName] = property.value.value ?? "";
          }
        }

        // Add children recursively
        for (const child of children) {
          convertNodeToXml(child, xmlElement);
        }

        if (parent) {
          parent.children.push(xmlElement);
        }

        return xmlElement;
      }

      return null;
    }

    // Create the root XML element
    const rootElements: Element[] = [];
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
      xmlString += xmlFormat(
        render(element, {
          xmlMode: true,
          encodeEntities: "utf8",
          emptyAttrs: true,
          selfClosingTags: true,
        }),
        {
          indentation: "  ",
          forceSelfClosingEmptyTag: true,
          lineSeparator: "\n",
        },
      );
    }

    return xmlString;
  }

  /**
   * Recursively traverses the tree, removes redundant name information from parent nodes,
   * and returns a list of all content (names) in the current subtree.
   */
  #pruneRedundantName(node: ChildNode): string[] {
    const elem = asTag(node);
    const text = asText(node);
    // RootWebArea should remain untouched - only process children
    if (elem?.tagName === "RootWebArea") {
      const descendantContent: string[] = [];
      for (const child of elem.children) {
        descendantContent.push(...this.#pruneRedundantName(child));
      }
      return this.#getTexts(elem).concat(descendantContent);
    }

    // Remove name if it equals text
    const nodeText = textContent(node);
    if (elem?.attribs.name && nodeText && elem.attribs.name === nodeText) {
      delete elem.attribs.name;
    }

    if (!(elem?.children || []).length) {
      return this.#getTexts(node);
    }

    // Recursively process children and gather all descendant content
    const descendantContent: string[] = [];
    for (const child of elem?.children || []) {
      descendantContent.push(...this.#pruneRedundantName(child));
    }

    // Sort by length, longest first, to handle overlapping substrings correctly
    descendantContent.sort((left, right) => right.length - left.length);

    for (const content of descendantContent) {
      if (elem?.attribs.name) {
        elem.attribs.name = elem.attribs.name.replace(content, "").trim();
      }
      if (elem?.attribs.label) {
        elem.attribs.label = elem.attribs.label.replace(content, "").trim();
      }
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
    if (elem?.attribs.name) {
      currentSubtreeContent.push(...this.#getTexts(node));
    }

    return currentSubtreeContent;
  }

  #getTexts(node: ChildNode): string[] {
    const elem = asTag(node);
    const text = asText(node);
    const texts = new Set<string>();
    if (elem?.attribs.name) {
      texts.add(elem.attribs.name);
    }
    if (elem?.attribs.label) {
      texts.add(elem.attribs.label);
    }
    if (text) {
      texts.add(text.data);
    }

    return Array.from(texts);
  }
}

function asTag(node: Node): Element | undefined {
  if (isTag(node)) {
    return node;
  }
}

function asNodeWithChildren(node: Node): NodeWithChildren | undefined {
  if (hasChildren(node)) {
    return node;
  }
}

function asText(node: Node): Text | undefined {
  if (isText(node)) {
    return node;
  }
}

//#region Types

// TODO: Find a place for these types, as they might be shared between different
// modules or even defined in an external library.

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

//#endregion
