import { Element as DomElement, Node as DomNode, Text } from "domhandler";
import { innerText } from "domutils";
import { parseDocument } from "htmlparser2";
import { Logger } from "../../../telemetry/Logger.ts";
import type { ElementsCache } from "./ElementsCache.ts";

const logger = Logger.get(import.meta.url);

export class ElementsCacheTree {
  #root: DomElement;

  constructor(treeXml: string) {
    this.#root = this.#parseXmlRoot(treeXml);
  }

  extractElementsList(): DomElement[] {
    const result: DomElement[] = [];
    const visit = (node: DomNode): void => {
      if (node instanceof DomElement) {
        result.push(node);
        for (const child of node.children) {
          visit(child);
        }
      }
    };
    for (const child of this.#root.children) {
      visit(child);
    }
    return result;
  }

  //#region Attrs extraction

  /**
   * Extract element attributes as a record with positional index.
   *
   * Finds the element by id, collects all attributes except id as raw strings,
   * then computes the element's positional index among all same role/property
   * elements.
   */
  extractAttrs(elementId: number): ElementsCache.Element | null {
    try {
      const elements = this.extractElementsList();
      const target = elements.find(
        (element) => element.attribs.id === String(elementId),
      );
      if (!target) {
        return null;
      }

      const attrs: Record<string, string | number> = {};
      for (const [key, value] of Object.entries(target.attribs)) {
        if (key !== "id") {
          attrs[key] = value;
        }
      }

      const text = ElementsCacheTree.normalizeText(
        ElementsCacheTree.extractText(target),
      );
      if (text) {
        attrs.text = text;
      }

      const matches = elements.filter((element) => {
        if (element.name !== target.name) {
          return false;
        }

        const props = { ...attrs };
        delete props.text;
        for (const [key, value] of Object.entries(props)) {
          if (element.attribs[key] !== value) {
            return false;
          }
        }

        if (attrs.text) {
          return (
            ElementsCacheTree.normalizeText(
              ElementsCacheTree.extractText(element),
            ) === attrs.text
          );
        }
        return true;
      });

      const index = Math.max(0, matches.indexOf(target));
      return {
        role: target.name,
        index,
        ...attrs,
      };
    } catch (error) {
      logger.debug(
        `Error extracting element attrs for id ${elementId}: ${error}`,
      );
      return null;
    }
  }

  resolveElements(
    elements: ElementsCache.Elements,
  ): Record<number, number> | null {
    if (elements.length === 0) {
      return {};
    }

    try {
      const allElements = this.extractElementsList();
      const result: Record<number, number> = {};

      for (const [listPos, element] of elements.entries()) {
        const role = String(element.role);
        const index = Number(element.index ?? 0);

        const props: Record<string, string | number> = {};
        for (const [key, value] of Object.entries(element)) {
          if (key !== "role" && key !== "index" && key !== "text") {
            props[key] = value;
          }
        }

        const textValue =
          typeof element.text === "string" ? element.text : undefined;

        const matches = allElements.filter((candidate) => {
          if (candidate.name !== role) {
            return false;
          }
          for (const [key, value] of Object.entries(props)) {
            if (candidate.attribs[key] !== String(value)) {
              return false;
            }
          }
          if (textValue) {
            return (
              ElementsCacheTree.normalizeText(
                ElementsCacheTree.extractText(candidate),
              ) === textValue
            );
          }
          return true;
        });

        if (index >= matches.length) {
          logger.debug(
            `Element index ${index} out of range (found ${matches.length} matches for ${role})`,
          );
          return null;
        }

        const target = matches[index];
        if (!target?.attribs.id) {
          logger.debug("Resolved element has no id attribute");
          return null;
        }

        result[listPos] = Number(target.attribs.id);
      }

      return result;
    } catch (error) {
      logger.debug(`Error resolving elements: ${error}`);
      return null;
    }
  }

  #parseXmlRoot(treeXml: string): DomElement {
    const document = parseDocument(`<root>${treeXml}</root>`, {
      xmlMode: true,
    });
    const root = document.children.find(
      (node): node is DomElement => node instanceof DomElement,
    );
    if (!root) throw new Error("Invalid accessibility tree XML");
    return root;
  }

  //#endregion

  //#region Utils

  static normalizeText(value: string): string {
    return value.replace(/\s+/g, " ").trim();
  }

  /**
   * Extracts text content from an element. It attempts to construct direct text
   * and return inner text only if it is empty.
   */
  static extractText(el: DomElement): string {
    const chunks: string[] = [];

    for (const child of el.children) {
      if (child instanceof Text) {
        chunks.push(child.data);
      }
    }

    const directText = chunks.join(" ").trim();
    if (directText) return directText;

    return innerText(el).trim();
  }

  //#endregion
}
