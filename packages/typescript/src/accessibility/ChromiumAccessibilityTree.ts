import { always } from "alwaysly";
import { Element } from "domhandler";
import { Telemetry } from "../telemetry/Telemetry.ts";
import { Xml } from "../Xml.ts";
import type { AccessibilityElement } from "./AccessibilityElement.ts";
import { BaseAccessibilityTree } from "./BaseAccessibilityTree.ts";

const { tracer } = Telemetry.get(import.meta.url);

interface CDPNode {
  nodeId?: string | number;
  parentId?: string | number | null;
  backendDOMNodeId?: number;
  role?: { value?: string };
  name?: { value?: string };
  ignored?: boolean;
  properties?: Array<{
    name?: string;
    value?: unknown;
  }>;
  childIds?: Array<string | number>;
  _playwright_node?: boolean;
  _locator_info?: Record<string, unknown>;
  _frame_url?: string;
  _frame?: object;
  _parent_iframe_backend_node_id?: number;
  _frame_chain?: number[];
}

export class ChromiumAccessibilityTree extends BaseAccessibilityTree {
  #cdpResponse: Record<string, unknown>;
  #nextRawId: number = 0;
  #raw: string | null = null;
  #frameMap: Record<number, object> = {}; // raw_id -> Frame object for iframe support
  #frameChainMap: Record<number, number[]> = {}; // raw_id -> frame chain (list of iframe backendNodeIds)

  constructor(cdpResponse: Record<string, unknown>) {
    super();
    this.#cdpResponse = cdpResponse;
  }

  /** Create a ChromiumAccessibilityTree instance from pre-computed XML. */
  static #fromXml(
    xmlString: string,
    frameMap?: Record<number, object>,
  ): ChromiumAccessibilityTree {
    const instance = new ChromiumAccessibilityTree({});
    instance.#raw = xmlString;
    if (frameMap) {
      instance.#frameMap = frameMap;
    }
    return instance;
  }

  /** Convert CDP response to raw XML format preserving all data. */
  toStr(): string {
    return tracer.span(
      "driver.tree.to_str",
      { "driver.tree.platform": "chromium" },
      () => {
        if (this.#raw !== null) {
          return this.#raw;
        }

        const nodes = (this.#cdpResponse.nodes as CDPNode[] | undefined) ?? [];
        if (nodes.length === 0) {
          this.#raw = "";
          return this.#raw;
        }

        // Create a lookup table for nodes by their ID
        const nodeLookup: Record<string, CDPNode> = {};
        for (const node of nodes) {
          if (node.nodeId !== undefined) {
            nodeLookup[String(node.nodeId)] = node;
          }
        }

        // Build mapping: backendDOMNodeId -> list of iframe child root nodes
        // This allows us to inline iframe content inside their parent <Iframe> elements
        const iframeChildren: Record<number, CDPNode[]> = {};
        const trueRoots: CDPNode[] = [];

        for (const node of nodes) {
          if (!node.parentId) {
            const parentIframeId = node._parent_iframe_backend_node_id;
            if (parentIframeId) {
              iframeChildren[parentIframeId] ??= [];
              iframeChildren[parentIframeId].push(node);
            } else {
              trueRoots.push(node);
            }
          }
        }

        // Build tree structure and convert to XML (only from true roots)
        const rootNodes: Element[] = [];
        for (const node of trueRoots) {
          const xmlNode = this.#nodeToXml(node, nodeLookup, iframeChildren);
          rootNodes.push(xmlNode);
        }

        // Combine all root nodes into a single XML string
        let xmlString = "";
        for (const root of rootNodes) {
          xmlString += Xml.format([root]);
        }

        this.#raw = xmlString;
        return this.#raw;
      },
    );
  }

  /** Convert a CDP node to XML element, recursively processing children. */
  #nodeToXml(
    node: CDPNode,
    nodeLookup: Record<string, CDPNode>,
    iframeChildren: Record<number, CDPNode[]>,
  ): Element {
    // Create element with role as tag
    const role = node.role?.value ?? "unknown";
    const elem = new Element(role, {});

    // Add our own sequential raw_id attribute
    this.#nextRawId++;
    elem.attribs["raw_id"] = String(this.#nextRawId);

    // Store frame reference if present (for iframe support)
    if ("_frame" in node && node._frame) {
      this.#frameMap[this.#nextRawId] = node._frame;
    }

    // Store frame chain if present (for Selenium nested frame switching)
    if ("_frame_chain" in node && node._frame_chain) {
      this.#frameChainMap[this.#nextRawId] = node._frame_chain;
    }

    // Add all node attributes as XML attributes
    if ("backendDOMNodeId" in node && node.backendDOMNodeId !== undefined) {
      elem.attribs["backendDOMNodeId"] = String(node.backendDOMNodeId);
    }
    if ("nodeId" in node && node.nodeId !== undefined) {
      elem.attribs["nodeId"] = String(node.nodeId);
    }
    if ("ignored" in node && node.ignored !== undefined) {
      elem.attribs["ignored"] = String(node.ignored);
    }

    // Store locator info for Playwright nodes (used for cross-origin iframes)
    if ("_playwright_node" in node && node._playwright_node) {
      elem.attribs["_playwright_node"] = "true";
    }
    if ("_locator_info" in node && node._locator_info !== undefined) {
      // Store as JSON-like string for later parsing
      elem.attribs["_locator_info"] = JSON.stringify(node._locator_info);
    }
    if ("_frame_url" in node && node._frame_url !== undefined) {
      elem.attribs["_frame_url"] = node._frame_url;
    }

    // Add name as attribute if present
    if ("name" in node && node.name && "value" in node.name) {
      elem.attribs["name"] = String(node.name.value);
    }

    // Add properties as attributes
    for (const prop of node.properties || []) {
      const propName = prop.name ?? "";
      const propValue = prop.value ?? {};
      if (
        typeof propValue === "object" &&
        propValue !== null &&
        "value" in (propValue as Record<string, unknown>)
      ) {
        elem.attribs[propName] = String(
          (propValue as { value?: unknown }).value,
        );
      } else if (typeof propValue === "object" && propValue !== null) {
        // Complex property values (like nodeList) are converted to empty string
        elem.attribs[propName] = "";
      } else {
        elem.attribs[propName] = String(propValue);
      }
    }

    // Process children recursively
    if (node.childIds) {
      for (const childIdAny of node.childIds) {
        const childId = String(childIdAny);
        if (nodeLookup[childId]) {
          const childElem = this.#nodeToXml(
            nodeLookup[childId],
            nodeLookup,
            iframeChildren,
          );
          childElem.parent = elem;
          if (elem.children.length > 0) {
            const prev = elem.children[elem.children.length - 1];
            always(prev);
            prev.next = childElem;
            childElem.prev = prev;
          }
          elem.children.push(childElem);
        }
      }
    }

    // Inline iframe content: if this element is an iframe, add its child trees
    const backendNodeId = node.backendDOMNodeId;
    if (backendNodeId && iframeChildren[backendNodeId]) {
      for (const childRoot of iframeChildren[backendNodeId]) {
        const childElem = this.#nodeToXml(
          childRoot,
          nodeLookup,
          iframeChildren,
        );
        childElem.parent = elem;
        if (elem.children.length > 0) {
          const prev = elem.children[elem.children.length - 1];
          always(prev);
          prev.next = childElem;
          childElem.prev = prev;
        }
        elem.children.push(childElem);
      }
    }

    return elem;
  }

  /**
   * Find element by raw_id and return its properties for element finding.
   *
   * @param rawId The raw_id to search for
   * @returns AccessibilityElement with backend_node_id set
   */
  elementById(rawId: number): AccessibilityElement {
    return tracer.span(
      "driver.tree.element_by_id",
      { "driver.tree.platform": "chromium" },
      () => {
        // Get raw XML with raw_id attributes
        const rawXml = this.toStr();
        const root = Xml.parseRoot(`<root>${rawXml}</root>`);

        // Find element with matching raw_id
        const findElement = (
          elem: Element,
          targetId: string,
        ): Element | null => {
          if (elem.attribs["raw_id"] === targetId) {
            return elem;
          }
          for (const child of Array.from(elem.children)) {
            const childEl = Xml.nodeAsTag(child);
            if (!childEl) {
              continue;
            }
            const result = findElement(childEl, targetId);
            if (result !== null) {
              return result;
            }
          }
          return null;
        };

        const element = findElement(root, String(rawId));
        if (element === null) {
          throw new Error(`No element with raw_id=${rawId} found`);
        }

        // Check if this is a Playwright node (cross-origin iframe element)
        if (element.attribs["_playwright_node"] === "true") {
          // Check if it's a synthetic frame node
          const frameUrl = element.attribs["_frame_url"];
          if (frameUrl) {
            // Synthetic iframe node - no locator info, use frame reference
            return {
              type: element.tagName,
              frame: this.#frameMap[rawId],
              locatorInfo: { _synthetic_frame: true, _frame_url: frameUrl },
            };
          }

          // Regular Playwright node with locator info
          const locatorInfoStr = element.attribs["_locator_info"];
          const locatorInfo = locatorInfoStr
            ? (JSON.parse(locatorInfoStr) as Record<string, unknown>)
            : {};

          return {
            type: element.tagName,
            frame: this.#frameMap[rawId],
            locatorInfo,
          };
        }

        // Extract backendDOMNodeId for Chromium CDP nodes
        const backendNodeIdStr = element.attribs["backendDOMNodeId"];
        if (backendNodeIdStr === undefined) {
          throw new Error(
            `Element with raw_id=${rawId} has no backendDOMNodeId attribute`,
          );
        }

        return {
          type: element.tagName,
          backendNodeId: parseInt(backendNodeIdStr),
          frame: this.#frameMap[rawId],
          frameChain: this.#frameChainMap[rawId],
        };
      },
    );
  }

  /** Scope the tree to a smaller subtree identified by raw_id. */
  scopeToArea(rawId: number): ChromiumAccessibilityTree {
    return tracer.span(
      "driver.tree.scope_to_area",
      { "driver.tree.platform": "chromium" },
      () => {
        const rawXml = this.toStr();

        // Parse the XML
        const root = Xml.parseRoot(`<root>${rawXml}</root>`);

        // Find the element with the matching raw_id
        const findElement = (
          elem: Element,
          targetId: string,
        ): Element | null => {
          if (elem.attribs["raw_id"] === targetId) {
            return elem;
          }
          for (const child of Array.from(elem.children)) {
            const childEl = Xml.nodeAsTag(child);
            if (!childEl) {
              continue;
            }
            const result = findElement(childEl, targetId);
            if (result !== null) {
              return result;
            }
          }
          return null;
        };

        const targetElem = findElement(root, String(rawId));

        if (targetElem === null) {
          // If not found, return original tree
          return this;
        }

        // Convert the scoped element back to XML string
        const scopedXml = Xml.format([targetElem]);

        return ChromiumAccessibilityTree.#fromXml(scopedXml, this.#frameMap);
      },
    );
  }
}
