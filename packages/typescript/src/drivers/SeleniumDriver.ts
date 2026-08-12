import * as fs from "fs/promises";

import {
  By,
  Key as SeleniumKey,
  WebDriver,
  WebElement,
} from "selenium-webdriver";
import {
  ElementNotInteractableError,
  NoSuchSessionError,
} from "selenium-webdriver/lib/error.js";

import { always } from "alwaysly";
import { BaseAccessibilityTree } from "../accessibility/BaseAccessibilityTree.ts";
import { ChromiumAccessibilityTree } from "../accessibility/ChromiumAccessibilityTree.ts";
import {
  enrichChromiumAXNodes,
  type ChromiumDOMNodeMetadata,
} from "../accessibility/enrichChromiumAXNodes.ts";
import type { ToolClass } from "../tools/BaseTool.ts";
import { ClickTool } from "../tools/ClickTool.ts";
import { DragAndDropTool } from "../tools/DragAndDropTool.ts";
import { HoverTool } from "../tools/HoverTool.ts";
import { PressKeyTool } from "../tools/PressKeyTool.ts";
import { TypeTool } from "../tools/TypeTool.ts";
import { UploadTool } from "../tools/UploadTool.ts";
import { BaseDriver } from "./BaseDriver.ts";
import { Keys } from "./keys.ts";
// NOTE: While macros work well in Bun, it fails when using Alumnium client from
// Node.js. A solution could be "node:sea" module, but current Bun version
// doesn't support it. For now, we bundle assets with scripts/generate.ts.
// import { readScript } from "./scripts/scripts.js" with { type: "macro" };
import type { ChromiumWebDriver } from "selenium-webdriver/chromium.js";
import { AppId } from "../AppId.ts";
import { Env } from "../Env.ts";
import { Telemetry } from "../telemetry/Telemetry.ts";
import type { Tracer } from "../telemetry/Tracer.ts";
import { TreeDevDrillError } from "../tree/dev/TreeDevDrillError.ts";
import type { Driver } from "./Driver.ts";
import {
  waiterScriptSource,
  waitForScriptSource,
} from "./scripts/bundledScripts.ts";
import type { ShadowRoot } from "selenium-webdriver/lib/webdriver.js";

const { tracer, logger } = Telemetry.get(import.meta.url);
const { span } = tracer.dec();
const stateful = BaseDriver.stateful;

interface CDPNode {
  nodeId: string;
  parentId?: string;
  backendDOMNodeId?: number;
  _parent_iframe_backend_node_id?: number;
  _frame_chain?: number[];
  _is_shadow_dom?: boolean;
  _mutable?: boolean;
  [key: string]: unknown;
}

interface CDPDomNode extends ChromiumDOMNodeMetadata {
  nodeName?: string;
  shadowRoots?: CDPDomNode[];
}

interface CDPFrameInfo {
  frame: {
    id: string;
    url: string;
  };
  childFrames?: CDPFrameInfo[];
}

const WAITER_SCRIPT = waiterScriptSource;
const WAIT_FOR_SCRIPT = waitForScriptSource;

export class SeleniumDriver extends BaseDriver {
  protected driver: ChromiumWebDriver;
  public platform: Driver.Platform = "chromium";
  #autoswitchToNewTabEnabled = true;
  #shadowChildToHostMap: Partial<Record<number, number>> = {};
  public fullPageScreenshot = Env.ALUMNIUM_FULL_PAGE_SCREENSHOT;
  public supportedTools: Set<ToolClass> = new Set([
    ClickTool,
    DragAndDropTool,
    HoverTool,
    PressKeyTool,
    TypeTool,
    UploadTool,
  ]);

  constructor(driver: WebDriver) {
    super();
    this.driver = driver as ChromiumWebDriver;
  }

  @span("driver.get_accessibility_tree", spanAttrs)
  protected async fetchAccessibilityTree(): Promise<BaseAccessibilityTree> {
    // Switch to default content to ensure we're at the top level for frame enumeration
    await this.driver.switchTo().defaultContent();
    logger.debug("Waiting for page to load before getting accessibility tree");
    await this.waitForPageToLoad();
    logger.debug("Page loaded, retrieving accessibility tree");

    // Get frame tree to enumerate all frames
    const frameTree = (await this.executeCdpCommand(
      "Page.getFrameTree",
      {},
    )) as {
      frameTree: CDPFrameInfo;
    };
    const frameIds = this.getAllFrameIds(frameTree.frameTree);
    const mainFrameId = frameTree.frameTree.frame.id;
    logger.debug(`Found ${frameIds.length} frames`);

    await this.executeCdpCommand("DOM.enable", {});
    const domResponse = (await this.executeCdpCommand(
      "DOM.getFlattenedDocument",
      { depth: -1, pierce: true },
    )) as { nodes: CDPDomNode[] };
    const domNodes = domResponse.nodes || [];

    let oopifFrameIds = new Set<string>();
    try {
      const targets = (await this.executeCdpCommand(
        "Target.getTargets",
        {},
      )) as {
        targetInfos?: Array<{ targetId: string; type: string }>;
      };
      oopifFrameIds = new Set(
        targets.targetInfos
          ?.filter((target) => target.type === "iframe")
          .map((target) => target.targetId) ?? [],
      );
    } catch {
      // Older Chromium versions may not expose target discovery through WebDriver.
    }

    // Build mapping: frameId -> backendNodeId of the iframe element containing the frame
    const frameToIframeMap: Map<string, number> = new Map();
    // Build mapping: frameId -> parent frameId (for nested frames)
    const frameParentMap: Map<string, string> = new Map();
    await this.buildFrameHierarchy(
      frameTree.frameTree,
      mainFrameId,
      frameToIframeMap,
      frameParentMap,
    );

    // Aggregate accessibility nodes from all frames
    const allNodes: CDPNode[] = [];
    for (const frameId of frameIds) {
      try {
        const response = (await this.executeCdpCommand(
          "Accessibility.getFullAXTree",
          { frameId },
        )) as { nodes: CDPNode[] };
        const nodes = response.nodes || [];
        enrichChromiumAXNodes(
          nodes,
          oopifFrameIds.has(frameId) ? [] : domNodes,
        );
        logger.debug(
          `  -> Frame ${frameId.slice(0, 20)}...: ${nodes.length} nodes`,
        );
        // Tag ALL nodes from child frames with their frame chain (list of iframe backendNodeIds)
        // This allows us to switch through nested frames when finding elements
        const frameChain = this.getFrameChain(
          frameId,
          frameToIframeMap,
          frameParentMap,
        );
        for (const node of nodes) {
          if (frameChain.length > 0) {
            node._frame_chain = frameChain;
          }
        }
        allNodes.push(...nodes);
      } catch (error) {
        logger.debug(
          `  -> Frame ${frameId.slice(0, 20)}...: failed (${error instanceof Error ? error.message : String(error)})`,
        );
      }
    }

    logger.debug(`Total accessibility nodes collected: ${allNodes.length}`);

    try {
      const frameChainsByBackendId: Partial<Record<number, number[]>> = {};
      for (const node of allNodes) {
        if (node.backendDOMNodeId && node._frame_chain)
          frameChainsByBackendId[node.backendDOMNodeId] = node._frame_chain;
      }
      const shadowNodes = await this.buildShadowHierarchy(
        domNodes,
        frameChainsByBackendId,
      );
      enrichChromiumAXNodes(shadowNodes, domNodes);
      allNodes.push(...shadowNodes);
      if (shadowNodes.length > 0) {
        logger.debug(`  -> Shadow DOM: ${shadowNodes.length} nodes added`);
      }
    } catch (error) {
      logger.debug(
        `  -> Shadow DOM failed (${error instanceof Error ? error.message : String(error)})`,
      );
    }

    return new ChromiumAccessibilityTree({ nodes: allNodes });
  }

  @span("driver.click", spanAttrs)
  @stateful
  async click(id: number): Promise<void> {
    await this.#autoswitchToNewTab(async () => {
      const element = await this.findElement(id);
      try {
        const actions = this.driver.actions({ async: true });
        await actions.move({ origin: element }).click().perform();
      } catch (error) {
        if (error instanceof ElementNotInteractableError) {
          // Fallback to direct click if ActionChains fails (e.g. for <option> elements)
          await element.click();
        } else {
          throw error;
        }
      }
    });
  }

  @span("driver.drag_slider", spanAttrs)
  @stateful
  async dragSlider(id: number, value: number): Promise<void> {
    const element = await this.findElement(id);
    await this.driver.executeScript(
      "arguments[0].value = arguments[1];" +
        "arguments[0].dispatchEvent(new Event('input', {bubbles: true}));" +
        "arguments[0].dispatchEvent(new Event('change', {bubbles: true}));",
      element,
      String(value),
    );
  }

  @span("driver.drag_and_drop", spanAttrs)
  @stateful
  async dragAndDrop(fromId: number, toId: number): Promise<void> {
    const actions = this.driver.actions({ async: true });
    await actions
      .dragAndDrop(await this.findElement(fromId), await this.findElement(toId))
      .perform();
  }

  @span("driver.hover", spanAttrs)
  @stateful
  async hover(id: number): Promise<void> {
    const actions = this.driver.actions({ async: true });
    await actions.move({ origin: await this.findElement(id) }).perform();
  }

  @span("driver.press_key", spanAttrs)
  @stateful
  pressKey(key: Keys.Key): Promise<void> {
    return this.#autoswitchToNewTab(async () => {
      const keyMap: Record<Keys.Key, string> = {
        Backspace: SeleniumKey.BACK_SPACE,
        Enter: SeleniumKey.ENTER,
        Escape: SeleniumKey.ESCAPE,
        Tab: SeleniumKey.TAB,
      };

      const actions = this.driver.actions({ async: true });
      await actions.sendKeys(keyMap[key]).perform();
    });
  }

  @span("driver.quit", spanAttrs)
  async quit(): Promise<void> {
    try {
      await this.driver.quit();
    } catch (error) {
      if (error instanceof NoSuchSessionError) {
        logger.info("Selenium session already closed, ignoring quit error");
      } else {
        throw error;
      }
    }
  }

  @span("driver.back", spanAttrs)
  @stateful
  async back(): Promise<void> {
    await this.driver.navigate().back();
  }

  @span("driver.visit", spanAttrs)
  @stateful
  async visit(url: string): Promise<void> {
    await this.driver.get(url);
  }

  @span("driver.scroll_to", spanAttrs)
  @stateful
  async scrollTo(id: number): Promise<void> {
    const element = await this.findElement(id);
    await this.driver.executeScript("arguments[0].scrollIntoView();", element);
  }

  @span("driver.screenshot", spanAttrs)
  async screenshot(): Promise<string> {
    if (this.fullPageScreenshot) {
      const result = (await this.executeCdpCommand("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
      })) as { data: string };
      return result.data;
    } else {
      return await this.driver.takeScreenshot();
    }
  }

  @span("driver.title", spanAttrs)
  title(): Promise<string> {
    return this.driver.getTitle();
  }

  @span("driver.type", spanAttrs)
  @stateful
  async type(id: number, text: string): Promise<void> {
    const element = await this.findElement(id);
    await element.clear();
    await element.sendKeys(text);
  }

  @span("driver.upload", spanAttrs)
  @stateful
  async upload(id: number, paths: string[]): Promise<void> {
    const element = await this.findElement(id);
    await element.sendKeys(paths.join("\n"));
  }

  @span("driver.url", spanAttrs)
  url(): Promise<string> {
    return this.driver.getCurrentUrl();
  }

  @span("driver.app", spanAttrs)
  async app(): Promise<AppId> {
    const currentUrl = await this.driver.getCurrentUrl();
    return AppId.parse(currentUrl);
  }

  @span("driver.find_element", spanAttrs)
  async findElement(id: number): Promise<WebElement> {
    const tree = await this.getAccessibilityTree();
    const accessibilityElement = tree.elementById(id);
    const backendNodeId = accessibilityElement.backendNodeId!;
    const frameChain = accessibilityElement.frameChain;

    // Switch through the frame chain if element is inside nested iframes
    if (frameChain && frameChain.length > 0) {
      await this.switchToFrameChain(frameChain);
    }

    // Use CDP to find element by backend node ID
    await this.executeCdpCommand("DOM.enable", {});
    await this.executeCdpCommand("DOM.getFlattenedDocument", {});

    const { nodeIds } = (await this.executeCdpCommand(
      "DOM.pushNodesByBackendIdsToFrontend",
      { backendNodeIds: [backendNodeId] },
    )) as { nodeIds: number[] };

    const nodeId = nodeIds[0];

    // Set temporary attribute to locate element
    await this.executeCdpCommand("DOM.setAttributeValue", {
      nodeId,
      name: "data-alumnium-id",
      value: String(backendNodeId),
    });

    const selector = `[data-alumnium-id='${backendNodeId}']`;
    const hostBackendNodeId = this.#shadowChildToHostMap[backendNodeId];

    const searchContext =
      hostBackendNodeId !== undefined
        ? await this.findShadowRoot(hostBackendNodeId)
        : this.driver;
    const element = await searchContext.findElement(By.css(selector));

    // Remove temporary attribute
    await this.executeCdpCommand("DOM.removeAttribute", {
      nodeId,
      name: "data-alumnium-id",
    });

    // Note: We don't switch back to default content here because the element
    // needs to remain in its frame context for subsequent operations (click, type, etc.)

    return element;
  }

  @span("driver.execute_script", spanAttrs)
  @stateful
  async executeScript(script: string): Promise<void> {
    await this.driver.executeScript(script);
  }

  @span("driver.print_to_pdf", spanAttrs)
  async printToPdf(filepath: string): Promise<void> {
    const { data } = (await this.executeCdpCommand("Page.printToPDF", {})) as {
      data: string;
    };
    await fs.writeFile(filepath, Buffer.from(data, "base64"));
  }

  @span("driver.switch_to_next_tab", spanAttrs)
  async switchToNextTab(): Promise<void> {
    const handles = await this.driver.getAllWindowHandles();
    if (handles.length <= 1) return;

    const current = await this.driver.getWindowHandle();
    const currentIndex = handles.indexOf(current);
    const nextIndex = (currentIndex + 1) % handles.length;

    await this.switchToTab(handles, nextIndex);
    // TODO: Consider making these debug values lazy, so there's less overhead
    logger.debug(
      `Switched to next tab: ${await this.driver.getTitle()} (${await this.driver.getCurrentUrl()})`,
    );
  }

  @span("driver.switch_to_previous_tab", spanAttrs)
  async switchToPreviousTab(): Promise<void> {
    const handles = await this.driver.getAllWindowHandles();
    if (handles.length <= 1) return;

    const current = await this.driver.getWindowHandle();
    const currentIndex = handles.indexOf(current);
    const prevIndex = (currentIndex - 1 + handles.length) % handles.length;

    await this.switchToTab(handles, prevIndex);
    // TODO: Consider making these debug values lazy, so there's less overhead
    logger.debug(
      `Switched to previous tab: ${await this.driver.getTitle()} (${await this.driver.getCurrentUrl()})`,
    );
  }

  @span("driver.wait", spanAttrs)
  @stateful
  async wait(seconds: number): Promise<void> {
    const clampedSeconds = Math.max(1, Math.min(30, seconds));
    await new Promise((resolve) => setTimeout(resolve, clampedSeconds * 1000));
  }

  @span("driver.wait_for_selector", spanAttrs)
  async waitForSelector(): Promise<void> {
    throw new Error("waitForSelector not supported for this driver");
  }

  @span("driver.internal.cdp_command", (cmd) => ({
    "driver.kind": "selenium",
    "driver.platform": "chromium",
    "driver.internal.cdp_command.name": cmd,
  }))
  private executeCdpCommand(cmd: string, params: object): Promise<unknown> {
    return this.driver.sendAndGetDevToolsCommand(cmd, params);
  }

  @span("driver.internal.wait_for_page_load")
  private async waitForPageToLoad(): Promise<void> {
    try {
      await this.driver.executeScript(WAITER_SCRIPT);
      const error = await this.driver.executeAsyncScript(WAIT_FOR_SCRIPT);
      if (error) {
        logger.warn(`Failed to wait for page to load: ${String(error)}`);
      }
    } catch {
      // Retry once on failure
      try {
        await this.driver.executeScript(WAITER_SCRIPT);
        const error = await this.driver.executeAsyncScript(WAIT_FOR_SCRIPT);
        if (error) {
          logger.warn(`Failed to wait for page to load: ${String(error)}`);
        }
      } catch (retryError) {
        logger.warn(
          `Failed to wait for page to load after retry: ${String(retryError)}`,
        );
      }
    }
  }

  @stateful("switchToTab")
  private async switchToTab(
    handles: string[],
    tabIndex: number,
  ): Promise<void> {
    always(handles[tabIndex]);
    await this.driver.switchTo().window(handles[tabIndex]);
  }

  async #autoswitchToNewTab<Result>(
    fn: () => Promise<Result>,
  ): Promise<Result> {
    if (!this.#autoswitchToNewTabEnabled) {
      return await fn();
    }

    return tracer.span("driver.internal.switch_to_new_tab", async () => {
      const currentHandles = await this.driver.getAllWindowHandles();

      const result = await fn();

      const newHandles = await this.driver.getAllWindowHandles();
      const newTabs = newHandles.filter((h) => !currentHandles.includes(h));

      if (newTabs.length) {
        const lastNewTab = newTabs[newTabs.length - 1];
        always(lastNewTab);

        if (lastNewTab !== (await this.driver.getWindowHandle())) {
          await this.driver.switchTo().window(lastNewTab);
          logger.debug(
            `Auto-switching to new tab: ${await this.driver.getTitle()} (${await this.driver.getCurrentUrl()})`,
          );
        }
      }

      return result;
    });
  }

  @span("driver.internal.switch_to_frame_chain")
  private async switchToFrameChain(frameChain: number[]): Promise<void> {
    // First switch to default content to ensure we're at the top level
    await this.driver.switchTo().defaultContent();

    // Switch through each iframe in the chain
    for (const iframeBackendNodeId of frameChain) {
      await this.switchToSingleFrame(iframeBackendNodeId);
    }
  }

  @span("driver.internal.switch_to_single_frame")
  private async switchToSingleFrame(
    iframeBackendNodeId: number,
  ): Promise<void> {
    // Use CDP to find and switch to the iframe
    await this.executeCdpCommand("DOM.enable", {});
    await this.executeCdpCommand("DOM.getFlattenedDocument", {});

    const { nodeIds } = (await this.executeCdpCommand(
      "DOM.pushNodesByBackendIdsToFrontend",
      { backendNodeIds: [iframeBackendNodeId] },
    )) as { nodeIds: number[] };

    const nodeId = nodeIds[0];

    let iframeElement: WebElement | undefined;
    let set = false;
    let failure: unknown;
    try {
      await this.executeCdpCommand("DOM.setAttributeValue", {
        nodeId,
        name: "data-alumnium-iframe-id",
        value: String(iframeBackendNodeId),
      });
      set = true;
      iframeElement = await this.driver.findElement(
        By.css(`[data-alumnium-iframe-id='${iframeBackendNodeId}']`),
      );
    } catch (error) {
      failure = error;
    } finally {
      if (set) {
        try {
          await this.executeCdpCommand("DOM.removeAttribute", {
            nodeId,
            name: "data-alumnium-iframe-id",
          });
        } catch (error) {
          failure ??= error;
        }
      }
    }

    if (failure) throw failure;
    always(iframeElement);

    await this.driver.switchTo().frame(iframeElement);
    logger.debug(
      `Switched to iframe with backendNodeId=${iframeBackendNodeId}`,
    );
  }

  @span("driver.internal.build_frame_hierarchy")
  private async buildFrameHierarchy(
    frameInfo: CDPFrameInfo,
    mainFrameId: string,
    frameToIframeMap: Map<string, number>,
    frameParentMap: Map<string, string>,
    parentFrameId?: string,
  ): Promise<void> {
    const frameId = frameInfo.frame.id;

    if (frameId !== mainFrameId) {
      // Get the iframe element that owns this frame
      await this.executeCdpCommand("DOM.enable", {});
      try {
        const ownerInfo = (await this.executeCdpCommand("DOM.getFrameOwner", {
          frameId,
        })) as { backendNodeId: number };
        frameToIframeMap.set(frameId, ownerInfo.backendNodeId);
        logger.debug(
          `Frame ${frameId.slice(0, 20)}... owned by iframe backendNodeId=${ownerInfo.backendNodeId}`,
        );
      } catch (error) {
        logger.debug(
          `Could not get frame owner for ${frameId.slice(0, 20)}...: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      // Track parent frame
      if (parentFrameId) {
        frameParentMap.set(frameId, parentFrameId);
      }
    }

    // Process children
    for (const child of frameInfo.childFrames || []) {
      await this.buildFrameHierarchy(
        child,
        mainFrameId,
        frameToIframeMap,
        frameParentMap,
        frameId,
      );
    }
  }

  private getFrameChain(
    frameId: string,
    frameToIframeMap: Map<string, number>,
    frameParentMap: Map<string, string>,
  ): number[] {
    const chain: number[] = [];
    let currentFrameId = frameId;

    while (frameToIframeMap.has(currentFrameId)) {
      const iframeBackendNodeId = frameToIframeMap.get(currentFrameId)!;
      chain.unshift(iframeBackendNodeId); // Insert at beginning to build from root
      // Move to parent frame
      if (frameParentMap.has(currentFrameId)) {
        currentFrameId = frameParentMap.get(currentFrameId)!;
      } else {
        break;
      }
    }

    return chain;
  }

  private getAllFrameIds(frameInfo: CDPFrameInfo): string[] {
    const frameIds: string[] = [frameInfo.frame.id];
    for (const child of frameInfo.childFrames || []) {
      frameIds.push(...this.getAllFrameIds(child));
    }
    return frameIds;
  }

  private async findShadowRoot(hostBackendNodeId: number): Promise<ShadowRoot> {
    const { nodeIds: hostNodeIds } = (await this.executeCdpCommand(
      "DOM.pushNodesByBackendIdsToFrontend",
      { backendNodeIds: [hostBackendNodeId] },
    )) as { nodeIds: number[] };

    await this.executeCdpCommand("DOM.setAttributeValue", {
      nodeId: hostNodeIds[0],
      name: "data-alumnium-host",
      value: String(hostBackendNodeId),
    });

    const hostElement = await this.driver.findElement(
      By.css(`[data-alumnium-host='${hostBackendNodeId}']`),
    );

    await this.executeCdpCommand("DOM.removeAttribute", {
      nodeId: hostNodeIds[0],
      name: "data-alumnium-host",
    });

    return hostElement.getShadowRoot();
  }

  private async buildShadowHierarchy(
    domNodes: CDPDomNode[],
    frameChainsByBackendId: Partial<Record<number, number[]>>,
  ): Promise<CDPNode[]> {
    const shadowNodes: CDPNode[] = [];
    const processedNodes = new Set<string>();

    // Build maps from the DOM tree
    const nodeIdToBackendId: Record<number, number> = {};
    const parentIdMap: Record<number, number> = {};
    const shadowRootToHostBackendId: Record<number, number> = {};

    for (const domNode of domNodes) {
      nodeIdToBackendId[domNode.nodeId] = domNode.backendNodeId;
      if (domNode.parentId !== undefined) {
        parentIdMap[domNode.nodeId] = domNode.parentId;
      }
      // Track shadow roots and their host's backendNodeId
      if (domNode.shadowRoots) {
        for (const sr of domNode.shadowRoots) {
          shadowRootToHostBackendId[sr.nodeId] = domNode.backendNodeId;
          // Shadow root nodes may not appear in the flat list, so track their parent too
          parentIdMap[sr.nodeId] = domNode.nodeId;
        }
      }
    }

    // Build childBackendNodeId -> hostBackendNodeId map by walking parent chains
    this.#shadowChildToHostMap = {};
    for (const domNode of domNodes) {
      const nodeBackendId = domNode.backendNodeId;
      let currentId: number | undefined = domNode.nodeId;
      while (currentId !== undefined) {
        if (currentId in shadowRootToHostBackendId) {
          this.#shadowChildToHostMap[nodeBackendId] =
            shadowRootToHostBackendId[currentId];
          break;
        }
        currentId = parentIdMap[currentId];
      }
    }

    // Find shadow hosts and collect their accessibility nodes
    for (const domNode of domNodes) {
      if (domNode.shadowRoots && domNode.shadowRoots.length > 0) {
        const frameChain = frameChainsByBackendId[domNode.backendNodeId];
        try {
          const axResponse = (await this.executeCdpCommand(
            "Accessibility.queryAXTree",
            { nodeId: domNode.nodeId },
          )) as { nodes: CDPNode[] };

          if (axResponse.nodes) {
            for (const axNode of axResponse.nodes) {
              if (processedNodes.has(axNode.nodeId)) continue;
              processedNodes.add(axNode.nodeId);

              axNode._is_shadow_dom = true;
              if (frameChain) axNode._frame_chain = frameChain;
              if (!axNode.backendDOMNodeId) {
                const backendId =
                  nodeIdToBackendId[Number.parseInt(axNode.nodeId)];
                if (backendId !== undefined) {
                  axNode.backendDOMNodeId = backendId;
                }
              }

              shadowNodes.push(axNode);

              if (axNode.childIds && Array.isArray(axNode.childIds)) {
                for (const childId of axNode.childIds) {
                  const childNodes = await this.getShadowChildNodes(
                    String(childId),
                    processedNodes,
                    nodeIdToBackendId,
                    frameChain,
                  );
                  shadowNodes.push(...childNodes);
                }
              }
            }
          }
        } catch {
          // Ignore errors for individual shadow hosts
        }
      }
    }

    return shadowNodes;
  }

  private async getShadowChildNodes(
    nodeId: string,
    processedNodes: Set<string>,
    nodeIdToBackendId: Record<number, number>,
    frameChain?: number[],
  ): Promise<CDPNode[]> {
    const nodes: CDPNode[] = [];

    if (processedNodes.has(nodeId)) return nodes;
    processedNodes.add(nodeId);

    try {
      const response = (await this.executeCdpCommand(
        "Accessibility.queryAXTree",
        { nodeId: Number.parseInt(nodeId) },
      )) as { nodes: CDPNode[] };

      if (response.nodes) {
        for (const node of response.nodes) {
          node._is_shadow_dom = true;
          if (frameChain) node._frame_chain = frameChain;

          if (!node.backendDOMNodeId) {
            const backendId = nodeIdToBackendId[Number.parseInt(node.nodeId)];
            if (backendId !== undefined) {
              node.backendDOMNodeId = backendId;
            }
          }

          nodes.push(node);

          if (node.childIds && Array.isArray(node.childIds)) {
            for (const childId of node.childIds) {
              const childNodes = await this.getShadowChildNodes(
                String(childId),
                processedNodes,
                nodeIdToBackendId,
                frameChain,
              );
              nodes.push(...childNodes);
            }
          }
        }
      }
    } catch {
      // Ignore errors for individual nodes
    }

    return nodes;
  }

  //#region Dev

  protected override async devDrillProbeTree(
    tree: BaseAccessibilityTree,
    rawId: number,
  ): Promise<number> {
    let accessibilityElement;
    try {
      accessibilityElement = tree.elementById(rawId);
    } catch (error) {
      throw new TreeDevDrillError("resolve", error);
    }

    const backendNodeId = accessibilityElement.backendNodeId;
    if (backendNodeId === undefined) {
      throw new TreeDevDrillError(
        "resolve",
        new Error(`Element with raw_id=${rawId} has no backend node ID`),
      );
    }

    const attribute = "data-alumnium-drill";
    let nodeId: number | undefined;
    let set = false;
    let failure: unknown;
    try {
      const frameChain = accessibilityElement.frameChain;
      if (frameChain?.length) await this.switchToFrameChain(frameChain);
      else await this.driver.switchTo().defaultContent();

      await this.executeCdpCommand("DOM.enable", {});
      await this.executeCdpCommand("DOM.getFlattenedDocument", {});
      const response = (await this.executeCdpCommand(
        "DOM.pushNodesByBackendIdsToFrontend",
        { backendNodeIds: [backendNodeId] },
      )) as { nodeIds: number[] };
      nodeId = response.nodeIds[0];
      if (!nodeId) {
        throw new TreeDevDrillError(
          "resolve",
          new Error(`No frontend node for backend node ID ${backendNodeId}`),
          backendNodeId,
        );
      }

      try {
        await this.executeCdpCommand("DOM.setAttributeValue", {
          nodeId,
          name: attribute,
          value: crypto.randomUUID(),
        });
        set = true;
      } catch (error) {
        throw new TreeDevDrillError("probe", error, backendNodeId);
      }
    } catch (error) {
      failure =
        error instanceof TreeDevDrillError
          ? error
          : new TreeDevDrillError("resolve", error, backendNodeId);
    } finally {
      if (set && nodeId) {
        try {
          await this.executeCdpCommand("DOM.removeAttribute", {
            nodeId,
            name: attribute,
          });
        } catch (error) {
          failure ??= new TreeDevDrillError("probe", error, backendNodeId);
        }
      }
      try {
        await this.driver.switchTo().defaultContent();
      } catch (error) {
        failure ??= new TreeDevDrillError("resolve", error, backendNodeId);
      }
    }

    if (failure) throw failure;
    return backendNodeId;
  }

  //#endregion
}

function spanAttrs(this: SeleniumDriver): Tracer.SpansDriverAttrs {
  return {
    "driver.kind": "selenium",
    "driver.platform": this.platform,
  };
}
