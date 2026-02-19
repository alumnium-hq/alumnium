import { always } from "alwaysly";
import { BaseServerAccessibilityTree } from "./baseServerAccessibilityTree.ts";

export class ServerUiAutomator2AccessibilityTree extends BaseServerAccessibilityTree {
  #tree: Node[];
  #idToNode: Record<number, Node>;

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
    const wrappedXmlString = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>\n <root>\n${cleanedXmlContent}\n</root>`;

    let rootElement: XmlDocument;
    try {
      // @ts-expect-error -- TODO: Missing Python API
      rootElement = fromstring(wrappedXmlString, "application/xml");
    } catch (error) {
      throw new Error(`Invalid XML string: ${error}`);
    }

    if (Array.from(rootElement.children).length) {
      for (const appElement of rootElement.children) {
        this.#tree.push(this.#parseElement(appElement));
      }
    }
  }

  #parseElement(element: XmlElement): Node {
    const simplifiedId = this.getNextId();
    const rawType = element.get("type") ?? element.tag;

    // Extract raw_id attribute
    const rawId = element.get("raw_id") ?? "";
    if (rawId) {
      const rawIdInt = parseInt(rawId);
      this.simplifiedToRawId[simplifiedId] = rawIdInt;
    }

    const ignored = element.get("ignored") === "true";

    const properties: NodeProperty[] = [];

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
      if (element.get(xmlAttrName)) {
        const propEntry: NodeProperty = { name: xmlAttrName };
        const attrValue = element.get(xmlAttrName) ?? "";

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

    const node: Node = {
      id: simplifiedId,
      role: rawType,
      ignored,
      properties,
      children: [],
    };

    this.#idToNode[simplifiedId] = node;

    for (const childElement of element.children) {
      node.children.push(this.#parseElement(childElement));
    }
    return node;
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
      ele: Node,
      parentElement: XmlElement,
    ): XmlElement | null {
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

        // @ts-expect-error -- TODO: Missing Python API
        const role = Element(simplifiedRole);
        if (!excludeAttrs.has("id")) {
          role.set("id", String(id));
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
          role.set("resource-id", resourceId);
        }
        if (contentDesc && !excludeAttrs.has("content-desc")) {
          role.set("content-desc", contentDesc);
        }
        if (textDesc && !excludeAttrs.has("text")) {
          role.set("text", textDesc);
        }
        if (clickable !== null && !excludeAttrs.has("clickable")) {
          role.set("clickable", clickable ? "true" : "false");
        }
        if (
          checked != null &&
          simplifiedRole === "CheckBox" &&
          !excludeAttrs.has("checked")
        ) {
          role.set("checked", checked ? "true" : "false");
        }

        parentElement.append(role);
        if (childElement.children.length) {
          convertDictToXml(childElement, role);
        }
      }

      return parentElement;
    }

    // @ts-expect-error -- TODO: Missing Python API
    const rootXml = Element("hierarchy");
    for (const ele of this.#tree) {
      convertDictToXml(ele, rootXml);
    }

    // @ts-expect-error -- TODO: Missing Python API
    indent(rootXml);

    // @ts-expect-error -- TODO: Missing Python API
    return tostring(rootXml, "unicode");
  }
}

//#region Scaffold Types

// TODO: Get rid of these in favor of the XML library types

interface NodeProperty {
  name: string;
  value?: string | number | boolean;
}

interface Node {
  id: number;
  role: string;
  ignored: boolean;
  properties: NodeProperty[];
  children: Node[];
}

interface XmlElement {
  attributes: {
    getNamedItem(name: string): unknown;
  };
  children: Iterable<XmlElement> & {
    length: number;
  };
  ownerDocument: {
    createElement(name: string): XmlElement;
  };
  tag: string;
  get(name: string): string | null;
  set(name: string, value: string): void;
  append(child: XmlElement): void;
}

interface XmlDocument {
  documentElement: XmlElement;
  querySelector(selector: string): { textContent: string | null } | null;
  children: Iterable<XmlElement>;
}

//#endregion
