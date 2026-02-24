import { always } from "alwaysly";
import { Element, Node } from "domhandler";
import { XML } from "../../xml/index.ts";
import { BaseServerAccessibilityTree } from "./BaseServerAccessibilityTree.ts";

export class ServerUIAutomator2AccessibilityTree extends BaseServerAccessibilityTree {
  #tree: InternalNode[];
  #idToNode: Record<number, InternalNode>;

  constructor(xmlString: string) {
    super();

    this.#tree = [];
    this.#idToNode = {};

    // cleaning multiple xml declaration lines from page source
    const xmlDeclarationPattern = /^\s*<\?xml.*\?>\s*$/;
    const lines = xmlString.split("\n");
    const cleanedLines = lines.filter(
      (line) => !xmlDeclarationPattern.test(line),
    );
    const cleanedXmlContent = cleanedLines.join("\n");

    let roots: Node[];
    try {
      roots = XML.parseMultiroot(cleanedXmlContent);
    } catch (error) {
      throw new Error(`Invalid XML string: ${error}`);
    }

    for (const root of roots) {
      const rootEl = XML.nodeAsTag(root);
      always(rootEl);
      for (const appElement of rootEl.children) {
        const internalNode = this.#parseElement(appElement);
        if (internalNode) {
          this.#tree.push(internalNode);
        }
      }
    }
  }

  #parseElement(nodeArg: XML.Node): InternalNode | null {
    const element = XML.nodeAsTag(nodeArg);
    // NOTE: In Python's XML implementation, non-element nodes (like text nodes)
    // aren't available as children of an element, so simply ignoring them here.
    if (!element) return null;

    const simplifiedId = element ? this.getNextId() : -1;
    const rawType = element.attribs.type ?? element.tagName;

    // Extract raw_id attribute
    const rawId = element.attribs["raw_id"] ?? "";
    if (rawId) {
      const rawIdInt = parseInt(rawId);
      this.simplifiedToRawId[simplifiedId] = rawIdInt;
    }

    const ignored = element.attribs.ignored === "true";

    const properties: InternalNodeProperty[] = [];

    const propXmlAttributes = [
      "class",
      "index",
      "width",
      "height",
      "text",
      "resource-id",
      "content-desc",
      "bounds",
      "checkable",
      "checked",
      "clickable",
      "displayed",
      "enabled",
      "focus",
      "focused",
      "focusable",
      "long-clickable",
      "password",
      "selected",
      "scrollable",
    ];

    for (const xmlAttrName of propXmlAttributes) {
      if (element.attribs[xmlAttrName]) {
        const propEntry: InternalNodeProperty = { name: xmlAttrName };
        const attrValue = element.attribs[xmlAttrName];

        if (
          [
            "checked",
            "checkable",
            "clickable",
            "displayed",
            "enabled",
            "focus",
            "focused",
            "focusable",
            "long-clickable",
            "password",
            "selected",
            "scrollable",
          ].includes(xmlAttrName)
        ) {
          propEntry.value = attrValue === "true";
        } else if (["index", "width", "height"].includes(xmlAttrName)) {
          const parsedInt = parseInt(attrValue);
          if (Number.isNaN(parsedInt)) {
            propEntry.value = attrValue;
          } else {
            propEntry.value = parsedInt;
          }
        } else if (
          ["resource-id", "content-desc", "bounds"].includes(xmlAttrName)
        ) {
          propEntry.value = attrValue;
        } else if (["class", "text"].includes(xmlAttrName)) {
          propEntry.value = attrValue;
        } else {
          propEntry.value = attrValue;
        }
        properties.push(propEntry);
      }
    }

    const internalNode: InternalNode = {
      id: simplifiedId,
      role: rawType,
      ignored,
      properties,
      children: [],
    };

    this.#idToNode[simplifiedId] = internalNode;

    for (const childElement of element.children || []) {
      const childNode = this.#parseElement(childElement);
      if (childNode) {
        internalNode.children.push(childNode);
      }
    }
    return internalNode;
  }

  /**
   * Convert tree to XML string.
   *
   * @param excludeAttrs Optional set of attribute names to exclude from output.
   */
  toXml(excludeAttrs: Set<string> = new Set()): string {
    if (!this.#tree.length) {
      return "";
    }

    function convertDictToXml(
      ele: InternalNode,
      parentElement: Element,
    ): Element | null {
      if (ele.ignored) {
        return null;
      }

      for (const childElement of ele.children) {
        const id = childElement.id;
        const simplifiedRole = childElement.role.split(".").at(-1);
        always(simplifiedRole);
        let resourceId: string | number | boolean = "";
        let contentDesc: string | number | boolean = "";
        let textDesc: string | number | boolean = "";
        let clickable = false;
        let checked: string | number | boolean | undefined;

        const role = new Element(simplifiedRole, {});
        if (!excludeAttrs.has("id")) {
          role.attribs.id = String(id);
        }

        for (const props of childElement.properties) {
          if (props.name === "resource-id" && props.value) {
            resourceId = props.value;
          }
          if (props.name === "content-desc" && props.value) {
            contentDesc = props.value;
          }
          if (props.name === "text" && props.value) {
            textDesc = props.value;
          }
          if (props.name === "clickable" && props.value) {
            clickable = true;
          }
          if (props.name === "checked") {
            checked = props.value;
          }
        }

        if (resourceId && !excludeAttrs.has("resource-id")) {
          role.attribs["resource-id"] = String(resourceId);
        }
        if (contentDesc && !excludeAttrs.has("content-desc")) {
          role.attribs["content-desc"] = String(contentDesc);
        }
        if (textDesc && !excludeAttrs.has("text")) {
          role.attribs.text = String(textDesc);
        }
        if (clickable !== null && !excludeAttrs.has("clickable")) {
          role.attribs.clickable = clickable ? "true" : "false";
        }
        if (
          checked != null &&
          simplifiedRole === "CheckBox" &&
          !excludeAttrs.has("checked")
        ) {
          role.attribs.checked = checked ? "true" : "false";
        }

        parentElement.children.push(role);
        if (childElement.children.length) {
          convertDictToXml(childElement, role);
        }
      }

      return parentElement;
    }

    const rootXml = new Element("hierarchy", {});
    for (const ele of this.#tree) {
      convertDictToXml(ele, rootXml);
    }

    return XML.format([rootXml]);
  }
}

//#region Types

// TODO: Find a place for these types, as they might be shared between different
// modules or even defined in an external library.

interface InternalNodeProperty {
  name: string;
  value?: string | number | boolean;
}

interface InternalNode {
  id: number;
  role: string;
  ignored: boolean;
  properties: InternalNodeProperty[];
  children: InternalNode[];
}

//#endregion
