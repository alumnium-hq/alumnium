import { readFileSync } from "fs";
import { dirname, join } from "path";
import {
  By,
  Key as SeleniumKey,
  WebDriver,
  WebElement,
} from "selenium-webdriver";
import { ChromiumWebDriver } from "selenium-webdriver/chromium.js";
import { NoSuchSessionError } from "selenium-webdriver/lib/error.js";
import { fileURLToPath } from "url";
import { BaseAccessibilityTree } from "../accessibility/BaseAccessibilityTree.js";
import { ChromiumAccessibilityTree } from "../accessibility/ChromiumAccessibilityTree.js";
import { ToolClass } from "../tools/BaseTool.js";
import { ClickTool } from "../tools/ClickTool.js";
import { DragAndDropTool } from "../tools/DragAndDropTool.js";
import { HoverTool } from "../tools/HoverTool.js";
import { PressKeyTool } from "../tools/PressKeyTool.js";
import { SelectTool } from "../tools/SelectTool.js";
import { TypeTool } from "../tools/TypeTool.js";
import { UploadTool } from "../tools/UploadTool.js";
import { getLogger } from "../utils/logger.js";
import { BaseDriver } from "./BaseDriver.js";
import { Key } from "./keys.js";

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logger = getLogger(["driver", "selenium"]);

/**
 * Decorator that automatically switches to new tabs opened during method execution.
 */
function autoswitchToNewTab(
  _target: unknown,
  _propertyKey: string | symbol,
  descriptor?: PropertyDescriptor
): PropertyDescriptor | void {
  // Handle both legacy and modern decorator standards
  if (!descriptor) {
    // Modern decorator - descriptor is undefined, need to return a new descriptor
    return;
  }

  // Legacy decorator - descriptor is provided
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const originalMethod: (...args: unknown[]) => Promise<void> =
    descriptor.value;

  descriptor.value = async function (
    this: SeleniumDriver,
    ...args: unknown[]
  ): Promise<void> {
    const currentHandles = await this.driver.getAllWindowHandles();
    await originalMethod.call(this, ...args);
    const newHandles = await this.driver.getAllWindowHandles();
    const newTabs = newHandles.filter((h) => !currentHandles.includes(h));
    if (newTabs.length > 0) {
      // Only switch to the last new tab, as only one tab can be active at the end.
      const lastNewTab = newTabs[newTabs.length - 1];
      if (lastNewTab !== (await this.driver.getWindowHandle())) {
        await this.driver.switchTo().window(lastNewTab);
        logger.debug(
          `Auto-switching to new tab: ${await this.driver.getTitle()} (${await this.driver.getCurrentUrl()})`
        );
      }
    }
  };

  return descriptor;
}

export class SeleniumDriver extends BaseDriver {
  private static WAITER_SCRIPT = readFileSync(
    join(__dirname, "scripts/waiter.js"),
    "utf8"
  );
  private static WAIT_FOR_SCRIPT = readFileSync(
    join(__dirname, "scripts/waitFor.js"),
    "utf8"
  );

  protected driver: ChromiumWebDriver;
  public platform: string = "chromium";
  public supportedTools: Set<ToolClass> = new Set([
    ClickTool,
    DragAndDropTool,
    HoverTool,
    PressKeyTool,
    SelectTool,
    TypeTool,
    UploadTool,
  ]);

  constructor(driver: WebDriver) {
    super();
    this.driver = driver as ChromiumWebDriver;
  }

  async getAccessibilityTree(): Promise<BaseAccessibilityTree> {
    // Switch to default content to ensure we're at the top level for frame enumeration
    await this.driver.switchTo().defaultContent();
    await this.waitForPageToLoad();

    // Get frame tree to enumerate all frames
    const frameTree = (await this.executeCdpCommand(
      "Page.getFrameTree",
      {}
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
      frameParentMap
    );

    // Aggregate accessibility nodes from all frames
    const allNodes: CDPNode[] = [];
    for (const frameId of frameIds) {
      try {
        const response = (await this.executeCdpCommand(
          "Accessibility.getFullAXTree",
          { frameId }
        )) as { nodes: CDPNode[] };
        const nodes = response.nodes || [];
        logger.debug(
          `  -> Frame ${frameId.slice(0, 20)}...: ${nodes.length} nodes`
        );
        // Tag ALL nodes from child frames with their frame chain (list of iframe backendNodeIds)
        // This allows us to switch through nested frames when finding elements
        const frameChain = this.getFrameChain(
          frameId,
          frameToIframeMap,
          frameParentMap
        );
        for (const node of nodes) {
          if (frameChain.length > 0) {
            node._frame_chain = frameChain;
          }
        }
        allNodes.push(...nodes);
      } catch (error) {
        logger.debug(
          `  -> Frame ${frameId.slice(0, 20)}...: failed (${error instanceof Error ? error.message : String(error)})`
        );
      }
    }

    return new ChromiumAccessibilityTree({ nodes: allNodes });
  }

  private async buildFrameHierarchy(
    frameInfo: CDPFrameInfo,
    mainFrameId: string,
    frameToIframeMap: Map<string, number>,
    frameParentMap: Map<string, string>,
    parentFrameId?: string
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
          `Frame ${frameId.slice(0, 20)}... owned by iframe backendNodeId=${ownerInfo.backendNodeId}`
        );
      } catch (error) {
        logger.debug(
          `Could not get frame owner for ${frameId.slice(0, 20)}...: ${error instanceof Error ? error.message : String(error)}`
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
        frameId
      );
    }
  }

  private getFrameChain(
    frameId: string,
    frameToIframeMap: Map<string, number>,
    frameParentMap: Map<string, string>
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

  @autoswitchToNewTab
  async click(id: number): Promise<void> {
    const element = await this.findElement(id);
    await element.click();
  }

  async dragAndDrop(fromId: number, toId: number): Promise<void> {
    const actions = this.driver.actions({ async: true });
    await actions
      .dragAndDrop(await this.findElement(fromId), await this.findElement(toId))
      .perform();
  }

  async hover(id: number): Promise<void> {
    const actions = this.driver.actions({ async: true });
    await actions.move({ origin: await this.findElement(id) }).perform();
  }

  @autoswitchToNewTab
  async pressKey(key: Key): Promise<void> {
    const keyMap: Record<Key, string> = {
      [Key.BACKSPACE]: SeleniumKey.BACK_SPACE,
      [Key.ENTER]: SeleniumKey.ENTER,
      [Key.ESCAPE]: SeleniumKey.ESCAPE,
      [Key.TAB]: SeleniumKey.TAB,
    };

    const actions = this.driver.actions({ async: true });
    await actions.sendKeys(keyMap[key]).perform();
  }

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

  async back(): Promise<void> {
    await this.driver.navigate().back();
  }

  async visit(url: string): Promise<void> {
    await this.driver.get(url);
  }

  async scrollTo(id: number): Promise<void> {
    const element = await this.findElement(id);
    await this.driver.executeScript("arguments[0].scrollIntoView();", element);
  }

  async screenshot(): Promise<string> {
    return await this.driver.takeScreenshot();
  }

  async select(id: number, option: string): Promise<void> {
    const element = await this.findElement(id);
    const tagName = await element.getTagName();

    // Handle case where option element is selected instead of select element
    let selectElement = element;
    if (tagName === "option") {
      selectElement = await element.findElement(By.xpath(".//parent::select"));
    }

    const options = await selectElement.findElements(By.tagName("option"));
    for (const opt of options) {
      const text = await opt.getText();
      if (text === option) {
        await opt.click();
        return;
      }
    }
  }

  async title(): Promise<string> {
    return await this.driver.getTitle();
  }

  async type(id: number, text: string): Promise<void> {
    const element = await this.findElement(id);
    await element.clear();
    await element.sendKeys(text);
  }

  async upload(id: number, paths: string[]): Promise<void> {
    const element = await this.findElement(id);
    await element.sendKeys(paths.join("\n"));
  }

  async url(): Promise<string> {
    return await this.driver.getCurrentUrl();
  }

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
      {
        backendNodeIds: [backendNodeId],
      }
    )) as { nodeIds: number[] };

    const nodeId = nodeIds[0];

    // Set temporary attribute to locate element
    await this.executeCdpCommand("DOM.setAttributeValue", {
      nodeId,
      name: "data-alumnium-id",
      value: String(backendNodeId),
    });

    const element = await this.driver.findElement(
      By.css(`[data-alumnium-id='${backendNodeId}']`)
    );

    // Remove temporary attribute
    await this.executeCdpCommand("DOM.removeAttribute", {
      nodeId,
      name: "data-alumnium-id",
    });

    // Note: We don't switch back to default content here because the element
    // needs to remain in its frame context for subsequent operations (click, type, etc.)

    return element;
  }

  private async switchToFrameChain(frameChain: number[]): Promise<void> {
    // First switch to default content to ensure we're at the top level
    await this.driver.switchTo().defaultContent();

    // Switch through each iframe in the chain
    for (const iframeBackendNodeId of frameChain) {
      await this.switchToSingleFrame(iframeBackendNodeId);
    }
  }

  private async switchToSingleFrame(
    iframeBackendNodeId: number
  ): Promise<void> {
    // Use CDP to find and switch to the iframe
    await this.executeCdpCommand("DOM.enable", {});
    await this.executeCdpCommand("DOM.getFlattenedDocument", {});

    const { nodeIds } = (await this.executeCdpCommand(
      "DOM.pushNodesByBackendIdsToFrontend",
      {
        backendNodeIds: [iframeBackendNodeId],
      }
    )) as { nodeIds: number[] };

    const nodeId = nodeIds[0];

    await this.executeCdpCommand("DOM.setAttributeValue", {
      nodeId,
      name: "data-alumnium-iframe-id",
      value: String(iframeBackendNodeId),
    });

    const iframeElement = await this.driver.findElement(
      By.css(`[data-alumnium-iframe-id='${iframeBackendNodeId}']`)
    );

    await this.executeCdpCommand("DOM.removeAttribute", {
      nodeId,
      name: "data-alumnium-iframe-id",
    });

    await this.driver.switchTo().frame(iframeElement);
    logger.debug(
      `Switched to iframe with backendNodeId=${iframeBackendNodeId}`
    );
  }

  async executeScript(script: string): Promise<void> {
    await this.driver.executeScript(script);
  }

  private async executeCdpCommand(
    cmd: string,
    params: object
  ): Promise<unknown> {
    return await this.driver.sendAndGetDevToolsCommand(cmd, params);
  }

  private async waitForPageToLoad(): Promise<void> {
    try {
      await this.driver.executeScript(SeleniumDriver.WAITER_SCRIPT);
      const error: unknown = await this.driver.executeAsyncScript(
        SeleniumDriver.WAIT_FOR_SCRIPT
      );
      if (error) {
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        logger.warn(`Failed to wait for page to load: ${String(error)}`);
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_e) {
      // Retry once on failure
      try {
        await this.driver.executeScript(SeleniumDriver.WAITER_SCRIPT);
        const error: unknown = await this.driver.executeAsyncScript(
          SeleniumDriver.WAIT_FOR_SCRIPT
        );
        if (error) {
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
          logger.warn(`Failed to wait for page to load: ${String(error)}`);
        }
      } catch (retryError: unknown) {
        logger.warn(
          `Failed to wait for page to load after retry: ${String(retryError)}`
        );
      }
    }
  }
}
