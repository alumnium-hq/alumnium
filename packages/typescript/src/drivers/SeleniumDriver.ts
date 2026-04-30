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
import type { ToolClass } from "../tools/BaseTool.ts";
import { ClickTool } from "../tools/ClickTool.ts";
import { DragAndDropTool } from "../tools/DragAndDropTool.ts";
import { HoverTool } from "../tools/HoverTool.ts";
import { PressKeyTool } from "../tools/PressKeyTool.ts";
import { TypeTool } from "../tools/TypeTool.ts";
import { UploadTool } from "../tools/UploadTool.ts";
import { BaseDriver } from "./BaseDriver.ts";
import { Keys } from "./keys.ts";
// NOTE: While macros work well in Bun, it fails when using Alumium client from
// Node.js. A solution could be "node:sea" module, but current Bun version
// doesn't support it. For now, we bundle assets with scripts/generate.ts.
// import { readScript } from "./scripts/scripts.js" with { type: "macro" };
import type { ChromiumWebDriver } from "selenium-webdriver/chromium.js";
import { AppId } from "../AppId.ts";
import { Telemetry } from "../telemetry/Telemetry.ts";
import type { Tracer } from "../telemetry/Tracer.ts";
import type { Driver } from "./Driver.ts";
import {
  waiterScriptSource,
  waitForScriptSource,
} from "./scripts/bundledScripts.ts";

const { tracer, logger } = Telemetry.get(import.meta.url);

interface CDPNode {
  nodeId: string;
  parentId?: string;
  _parent_iframe_backend_node_id?: number;
  _frame_chain?: number[];
  [key: string]: unknown;
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
  #autoswitchToNewTabEnabled: boolean = true;
  public fullPageScreenshot: boolean =
    (process.env.ALUMNIUM_FULL_PAGE_SCREENSHOT || "false").toLowerCase() ===
    "true";
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

  async getAccessibilityTree(): Promise<BaseAccessibilityTree> {
    return tracer.span(
      "driver.get_accessibility_tree",
      this.#spanAttrs(),
      async () => {
        // Switch to default content to ensure we're at the top level for frame enumeration
        await this.driver.switchTo().defaultContent();
        logger.debug(
          "Waiting for page to load before getting accessibility tree",
        );
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

        return new ChromiumAccessibilityTree({ nodes: allNodes });
      },
    );
  }

  private async buildFrameHierarchy(
    frameInfo: CDPFrameInfo,
    mainFrameId: string,
    frameToIframeMap: Map<string, number>,
    frameParentMap: Map<string, string>,
    parentFrameId?: string,
  ): Promise<void> {
    return tracer.span("driver.internal.build_frame_hierarchy", async () => {
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
    });
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

  async click(id: number): Promise<void> {
    return tracer.span("driver.click", this.#spanAttrs(), () =>
      this.#autoswitchToNewTab(async () => {
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
      }),
    );
  }

  async dragSlider(id: number, value: number): Promise<void> {
    return tracer.span("driver.drag_slider", this.#spanAttrs(), async () => {
      const element = await this.findElement(id);
      await this.driver.executeScript(
        "arguments[0].value = arguments[1];" +
          "arguments[0].dispatchEvent(new Event('input', {bubbles: true}));" +
          "arguments[0].dispatchEvent(new Event('change', {bubbles: true}));",
        element,
        String(value),
      );
    });
  }

  async dragAndDrop(fromId: number, toId: number): Promise<void> {
    return tracer.span("driver.drag_and_drop", this.#spanAttrs(), async () => {
      const actions = this.driver.actions({ async: true });
      await actions
        .dragAndDrop(
          await this.findElement(fromId),
          await this.findElement(toId),
        )
        .perform();
    });
  }

  async hover(id: number): Promise<void> {
    return tracer.span("driver.hover", this.#spanAttrs(), async () => {
      const actions = this.driver.actions({ async: true });
      await actions.move({ origin: await this.findElement(id) }).perform();
    });
  }

  pressKey(key: Keys.Key): Promise<void> {
    return tracer.span("driver.press_key", this.#spanAttrs(), () =>
      this.#autoswitchToNewTab(async () => {
        const keyMap: Record<Keys.Key, string> = {
          Backspace: SeleniumKey.BACK_SPACE,
          Enter: SeleniumKey.ENTER,
          Escape: SeleniumKey.ESCAPE,
          Tab: SeleniumKey.TAB,
        };

        const actions = this.driver.actions({ async: true });
        await actions.sendKeys(keyMap[key]).perform();
      }),
    );
  }

  async quit(): Promise<void> {
    return tracer.span("driver.quit", this.#spanAttrs(), async () => {
      try {
        await this.driver.quit();
      } catch (error) {
        if (error instanceof NoSuchSessionError) {
          logger.info("Selenium session already closed, ignoring quit error");
        } else {
          throw error;
        }
      }
    });
  }

  async back(): Promise<void> {
    return tracer.span("driver.back", this.#spanAttrs(), () =>
      this.driver.navigate().back(),
    );
  }

  async visit(url: string): Promise<void> {
    return tracer.span("driver.visit", this.#spanAttrs(), () =>
      this.driver.get(url),
    );
  }

  async scrollTo(id: number): Promise<void> {
    return tracer.span("driver.scroll_to", this.#spanAttrs(), async () => {
      const element = await this.findElement(id);
      await this.driver.executeScript(
        "arguments[0].scrollIntoView();",
        element,
      );
    });
  }

  async screenshot(): Promise<string> {
    return tracer.span("driver.screenshot", this.#spanAttrs(), async () => {
      if (this.fullPageScreenshot) {
        const result = (await this.executeCdpCommand("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: true,
        })) as { data: string };
        return result.data;
      } else {
        return await this.driver.takeScreenshot();
      }
    });
  }

  title(): Promise<string> {
    return tracer.span("driver.title", this.#spanAttrs(), () =>
      this.driver.getTitle(),
    );
  }

  async type(id: number, text: string): Promise<void> {
    return tracer.span("driver.type", this.#spanAttrs(), async () => {
      const element = await this.findElement(id);
      await element.clear();
      await element.sendKeys(text);
    });
  }

  async upload(id: number, paths: string[]): Promise<void> {
    return tracer.span(
      "driver.upload",
      this.#spanAttrs(),

      async () => {
        const element = await this.findElement(id);
        await element.sendKeys(paths.join("\n"));
      },
    );
  }

  url(): Promise<string> {
    return tracer.span("driver.url", this.#spanAttrs(), () =>
      this.driver.getCurrentUrl(),
    );
  }

  async app(): Promise<AppId> {
    return tracer.span("driver.app", this.#spanAttrs(), async () => {
      const currentUrl = await this.driver.getCurrentUrl();
      return AppId.parse(currentUrl);
    });
  }

  async findElement(id: number): Promise<WebElement> {
    return tracer.span("driver.find_element", this.#spanAttrs(), async () => {
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

      const element = await this.driver.findElement(
        By.css(`[data-alumnium-id='${backendNodeId}']`),
      );

      // Remove temporary attribute
      await this.executeCdpCommand("DOM.removeAttribute", {
        nodeId,
        name: "data-alumnium-id",
      });

      // Note: We don't switch back to default content here because the element
      // needs to remain in its frame context for subsequent operations (click, type, etc.)

      return element;
    });
  }

  private async switchToFrameChain(frameChain: number[]): Promise<void> {
    return tracer.span("driver.internal.switch_to_frame_chain", async () => {
      // First switch to default content to ensure we're at the top level
      await this.driver.switchTo().defaultContent();

      // Switch through each iframe in the chain
      for (const iframeBackendNodeId of frameChain) {
        await this.switchToSingleFrame(iframeBackendNodeId);
      }
    });
  }

  private async switchToSingleFrame(
    iframeBackendNodeId: number,
  ): Promise<void> {
    return tracer.span("driver.internal.switch_to_single_frame", async () => {
      // Use CDP to find and switch to the iframe
      await this.executeCdpCommand("DOM.enable", {});
      await this.executeCdpCommand("DOM.getFlattenedDocument", {});

      const { nodeIds } = (await this.executeCdpCommand(
        "DOM.pushNodesByBackendIdsToFrontend",
        { backendNodeIds: [iframeBackendNodeId] },
      )) as { nodeIds: number[] };

      const nodeId = nodeIds[0];

      await this.executeCdpCommand("DOM.setAttributeValue", {
        nodeId,
        name: "data-alumnium-iframe-id",
        value: String(iframeBackendNodeId),
      });

      const iframeElement = await this.driver.findElement(
        By.css(`[data-alumnium-iframe-id='${iframeBackendNodeId}']`),
      );

      await this.executeCdpCommand("DOM.removeAttribute", {
        nodeId,
        name: "data-alumnium-iframe-id",
      });

      await this.driver.switchTo().frame(iframeElement);
      logger.debug(
        `Switched to iframe with backendNodeId=${iframeBackendNodeId}`,
      );
    });
  }

  async executeScript(script: string): Promise<void> {
    return tracer.span("driver.execute_script", this.#spanAttrs(), async () => {
      await this.driver.executeScript(script);
    });
  }

  async printToPdf(filepath: string): Promise<void> {
    return tracer.span("driver.print_to_pdf", this.#spanAttrs(), async () => {
      const { data } = (await this.executeCdpCommand(
        "Page.printToPDF",
        {},
      )) as {
        data: string;
      };
      await fs.writeFile(filepath, Buffer.from(data, "base64"));
    });
  }

  async switchToNextTab(): Promise<void> {
    return tracer.span(
      "driver.switch_to_next_tab",
      this.#spanAttrs(),
      async () => {
        const handles = await this.driver.getAllWindowHandles();
        if (handles.length <= 1) return;

        const current = await this.driver.getWindowHandle();
        const currentIndex = handles.indexOf(current);
        const nextIndex = (currentIndex + 1) % handles.length;

        always(handles[nextIndex]);
        await this.driver.switchTo().window(handles[nextIndex]);
        logger.debug(
          `Switched to next tab: ${await this.driver.getTitle()} (${await this.driver.getCurrentUrl()})`,
        );
      },
    );
  }

  async switchToPreviousTab(): Promise<void> {
    return tracer.span(
      "driver.switch_to_previous_tab",
      this.#spanAttrs(),
      async () => {
        const handles = await this.driver.getAllWindowHandles();
        if (handles.length <= 1) return;

        const current = await this.driver.getWindowHandle();
        const currentIndex = handles.indexOf(current);
        const prevIndex = (currentIndex - 1 + handles.length) % handles.length;

        always(handles[prevIndex]);
        await this.driver.switchTo().window(handles[prevIndex]);
        logger.debug(
          `Switched to previous tab: ${await this.driver.getTitle()} (${await this.driver.getCurrentUrl()})`,
        );
      },
    );
  }

  async wait(seconds: number): Promise<void> {
    return tracer.span("driver.wait", this.#spanAttrs(), async () => {
      const clampedSeconds = Math.max(1, Math.min(30, seconds));
      await new Promise((resolve) =>
        setTimeout(resolve, clampedSeconds * 1000),
      );
    });
  }

  async waitForSelector(): Promise<void> {
    return tracer.span("driver.wait_for_selector", this.#spanAttrs(), () => {
      throw new Error("waitForSelector not supported for this driver");
    });
  }

  private executeCdpCommand(cmd: string, params: object): Promise<unknown> {
    return tracer.span(
      "driver.internal.cdp_command",
      {
        ...this.#spanAttrs(),
        "driver.internal.cdp_command.name": cmd,
      },
      () => this.driver.sendAndGetDevToolsCommand(cmd, params),
    );
  }

  private async waitForPageToLoad(): Promise<void> {
    return tracer.span("driver.internal.wait_for_page_load", async () => {
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
    });
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

  #spanAttrs(): Tracer.SpansDriverAttrsBase {
    return {
      "driver.kind": "selenium",
      "driver.platform": this.platform,
    };
  }
}
