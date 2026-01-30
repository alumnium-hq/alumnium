import { readFileSync } from "fs";
import { dirname, join } from "path";
import { CDPSession, Frame, Locator, Page } from "playwright";
import { fileURLToPath } from "url";
import { BaseAccessibilityTree } from "../accessibility/BaseAccessibilityTree.js";
import { ChromiumAccessibilityTree } from "../accessibility/ChromiumAccessibilityTree.js";
import { ToolClass } from "../tools/BaseTool.js";
import { ClickTool } from "../tools/ClickTool.js";
import { DragAndDropTool } from "../tools/DragAndDropTool.js";
import { HoverTool } from "../tools/HoverTool.js";
import { PressKeyTool } from "../tools/PressKeyTool.js";
import { TypeTool } from "../tools/TypeTool.js";
import { UploadTool } from "../tools/UploadTool.js";
import { getLogger } from "../utils/logger.js";
import { retry } from "../utils/retry.js";
import { BaseDriver } from "./BaseDriver.js";
import { Key } from "./keys.js";

interface CDPNode {
  nodeId: string;
  parentId?: string | null;
  role?: { value?: string };
  name?: { value?: string };
  childIds?: string[];
  _playwright_node?: boolean;
  _locator_info?: Record<string, unknown>;
  _frame_url?: string;
  _frame?: object;
  _frame_chain?: number[];
  _parent_iframe_backend_node_id?: number;
}

interface CDPFrameInfo {
  frame: {
    id: string;
    url: string;
  };
  childFrames?: CDPFrameInfo[];
}

interface CDPFrameTree {
  frameTree: CDPFrameInfo;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logger = getLogger(["driver", "playwright"]);

const CONTEXT_WAS_DESTROYED_ERROR = "Execution context was destroyed";

export class PlaywrightDriver extends BaseDriver {
  private static WAITER_SCRIPT = readFileSync(
    join(__dirname, "scripts/waiter.js"),
    "utf8"
  );
  private static WAIT_FOR_SCRIPT = `(...scriptArgs) => new Promise((resolve) => { const arguments = [...scriptArgs, resolve]; ${readFileSync(
    join(__dirname, "scripts/waitFor.js"),
    "utf8"
  )} })`;

  private client!: CDPSession;
  private page: Page;
  public platform: string = "chromium";
  public supportedTools: Set<ToolClass> = new Set([
    ClickTool,
    DragAndDropTool,
    HoverTool,
    PressKeyTool,
    TypeTool,
    UploadTool,
  ]);
  public newTabTimeout = parseInt(
    process.env.ALUMNIUM_PLAYWRIGHT_NEW_TAB_TIMEOUT || "200",
    10
  );

  constructor(page: Page) {
    super();
    this.page = page;
    void this.initCDPSession();
  }

  private async initCDPSession(): Promise<void> {
    this.client = await this.page.context().newCDPSession(this.page);
    await this.enableTargetAutoAttach();
  }

  private async enableTargetAutoAttach(): Promise<void> {
    try {
      await this.client.send("Target.setAutoAttach", {
        autoAttach: true,
        waitForDebuggerOnStart: false,
        flatten: true,
      });
      logger.debug("Enabled Target.setAutoAttach for OOPIF support");
    } catch (error) {
      logger.debug(
        `Could not enable Target.setAutoAttach: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async getAccessibilityTree(): Promise<BaseAccessibilityTree> {
    await this.waitForPageToLoad();

    // Get frame tree to enumerate all frames (same approach as Selenium)
    const frameTree = (await this.client.send(
      "Page.getFrameTree"
    )) as CDPFrameTree;
    const frameIds = this.getAllFrameIds(frameTree.frameTree);
    const mainFrameId = frameTree.frameTree.frame.id;
    logger.debug(`Found ${frameIds.length} frames`);

    // Get all targets including OOPIFs (cross-origin iframes)
    let oopifTargets: Array<{ url?: string; type?: string }> = [];
    try {
      const targets = await this.client.send("Target.getTargets");
      oopifTargets = this.getOopifTargets(targets, frameTree);
      logger.debug(`Found ${oopifTargets.length} cross-origin iframes`);
    } catch (error) {
      logger.debug(
        `Could not get OOPIF targets: ${error instanceof Error ? error.message : String(error)}`
      );
    }

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

    // Build mapping: frameId -> Playwright Frame object (for element finding)
    const frameIdToPlaywrightFrame: Map<string, Frame> = new Map();
    for (const frame of this.page.frames()) {
      const cdpFrameId = this.findCdpFrameIdByUrl(frameTree, frame.url());
      if (cdpFrameId) {
        frameIdToPlaywrightFrame.set(cdpFrameId, frame);
      }
    }

    // Aggregate accessibility nodes from all frames
    const allNodes: CDPNode[] = [];
    for (const frameId of frameIds) {
      try {
        const response = (await this.client.send(
          "Accessibility.getFullAXTree",
          {
            frameId,
          }
        )) as { nodes: CDPNode[] };
        const nodes = response.nodes || [];
        logger.debug(
          `  -> Frame ${frameId.slice(0, 20)}...: ${nodes.length} nodes`
        );

        // Calculate frame chain for this frame
        const frameChain = this.getFrameChain(
          frameId,
          frameToIframeMap,
          frameParentMap
        );
        // Get Playwright frame reference
        const playwrightFrame =
          frameIdToPlaywrightFrame.get(frameId) || this.page.mainFrame();

        // Tag ALL nodes from child frames with their frame chain
        for (const node of nodes) {
          if (frameChain.length > 0) {
            node._frame_chain = frameChain;
          }
          // Also keep frame reference for Playwright-specific element finding
          node._frame = playwrightFrame;
          // Tag root nodes with their parent iframe's backendNodeId (for tree inlining)
          if (node.parentId === undefined && frameToIframeMap.has(frameId)) {
            node._parent_iframe_backend_node_id = frameToIframeMap.get(frameId);
          }
          allNodes.push(node);
        }
      } catch (error) {
        logger.debug(
          `  -> Frame ${frameId.slice(0, 20)}...: failed (${error instanceof Error ? error.message : String(error)})`
        );
      }
    }

    // Process cross-origin iframes via Playwright query fallback
    for (const oopif of oopifTargets) {
      try {
        const nodes = await this.getCrossOriginFrameNodes(oopif);
        allNodes.push(...nodes);
        logger.debug(
          `  -> Cross-origin iframe ${(oopif.url || "").slice(0, 40)}...: ${nodes.length} nodes`
        );
      } catch (error) {
        logger.debug(
          `  -> Cross-origin iframe ${(oopif.url || "").slice(0, 40)}...: failed (${error instanceof Error ? error.message : String(error)})`
        );
      }
    }

    // Process Playwright frames not in CDP tree (e.g., data: URI iframes)
    const cdpFrameUrls = new Set(this.getAllFrameUrls(frameTree.frameTree));
    const oopifUrls = new Set(oopifTargets.map((t) => t.url || ""));
    for (const frame of this.page.frames()) {
      const frameUrl = frame.url();
      if (!cdpFrameUrls.has(frameUrl) && !oopifUrls.has(frameUrl)) {
        logger.debug(
          `Processing Playwright-only frame: ${frameUrl.slice(0, 60)}`
        );
        try {
          const iframeBackendNodeId =
            await this.getIframeBackendNodeIdByUrl(frameUrl);
          const nodes = await this.queryFrameInteractiveElements(
            frame,
            iframeBackendNodeId
          );
          allNodes.push(...nodes);
          logger.debug(
            `  -> Playwright-only frame ${frameUrl.slice(0, 40)}...: ${nodes.length} nodes`
          );
        } catch (error) {
          logger.debug(
            `  -> Playwright-only frame ${frameUrl.slice(0, 40)}...: failed (${error instanceof Error ? error.message : String(error)})`
          );
        }
      }
    }

    return new ChromiumAccessibilityTree({ nodes: allNodes });
  }

  async click(id: number): Promise<void> {
    const element = await this.findElement(id);
    const tagName = await element.evaluate(
      (el: { tagName: string }) => el.tagName
    );
    if (tagName?.toLowerCase() === "option") {
      const value = await element.evaluate((el: { value: string }) => el.value);
      await this.autoswitchToNewTab(async () => {
        await element.locator("xpath=parent::select").selectOption(value);
      });
    } else {
      await this.autoswitchToNewTab(async () => {
        await element.click({ force: true });
      });
    }
  }

  async dragAndDrop(fromId: number, toId: number): Promise<void> {
    const fromElement = await this.findElement(fromId);
    const toElement = await this.findElement(toId);
    await fromElement.dragTo(toElement);
  }

  async hover(id: number): Promise<void> {
    const element = await this.findElement(id);
    await element.hover();
  }

  async pressKey(key: Key): Promise<void> {
    const keyMap: Record<Key, string> = {
      [Key.BACKSPACE]: "Backspace",
      [Key.ENTER]: "Enter",
      [Key.ESCAPE]: "Escape",
      [Key.TAB]: "Tab",
    };

    await this.autoswitchToNewTab(() => this.page.keyboard.press(keyMap[key]));
  }

  async quit(): Promise<void> {
    await this.page.close();
  }

  async back(): Promise<void> {
    await this.page.goBack();
  }

  async visit(url: string): Promise<void> {
    await this.page.goto(url);
  }

  async scrollTo(id: number): Promise<void> {
    const element = await this.findElement(id);
    await element.scrollIntoViewIfNeeded();
  }

  @retry({
    maxAttempts: 2,
    backOff: 500,
    doRetry: (error: Error) =>
      error.message.includes(CONTEXT_WAS_DESTROYED_ERROR),
  })
  async screenshot(): Promise<string> {
    const buffer = await this.page.screenshot();
    return buffer.toString("base64");
  }

  @retry({
    maxAttempts: 2,
    backOff: 500,
    doRetry: (error: Error) =>
      error.message.includes(CONTEXT_WAS_DESTROYED_ERROR),
  })
  async title(): Promise<string> {
    return await this.page.title();
  }

  async type(id: number, text: string): Promise<void> {
    const element = await this.findElement(id);
    await element.fill(text);
  }

  async upload(id: number, paths: string[]): Promise<void> {
    const element = await this.findElement(id);
    const [fileChooser] = await Promise.all([
      this.page.waitForEvent("filechooser", { timeout: 5000 }),
      element.click({ force: true }),
    ]);
    await fileChooser.setFiles(paths);
  }

  @retry({
    maxAttempts: 2,
    backOff: 500,
    doRetry: (error: Error) =>
      error.message.includes(CONTEXT_WAS_DESTROYED_ERROR),
  })
  url(): Promise<string> {
    return Promise.resolve(this.page.url());
  }

  async findElement(id: number): Promise<Locator> {
    const tree = await this.getAccessibilityTree();
    const accessibilityElement = tree.elementById(id);

    // Get frame reference (default to main frame)
    const frame = (accessibilityElement.frame ||
      this.page.mainFrame()) as Frame;

    // Handle Playwright nodes (cross-origin iframes) using locator info
    if (accessibilityElement.locatorInfo) {
      return this.findElementByLocatorInfo(
        frame,
        accessibilityElement.locatorInfo
      );
    }

    // Existing CDP node logic
    const backendNodeId = accessibilityElement.backendNodeId!;

    // Beware!
    await this.client.send("DOM.enable");
    await this.client.send("DOM.getFlattenedDocument");
    const nodeIds = await this.client.send(
      "DOM.pushNodesByBackendIdsToFrontend",
      {
        backendNodeIds: [backendNodeId],
      }
    );
    const nodeId = nodeIds.nodeIds[0];
    await this.client.send("DOM.setAttributeValue", {
      nodeId,
      name: "data-alumnium-id",
      value: String(backendNodeId),
    });
    // TODO: We need to remove the attribute after we are done with the element,
    // but Playwright locator is lazy and we cannot guarantee when it is safe to do so.
    return frame.locator(`css=[data-alumnium-id='${backendNodeId}']`);
  }

  async executeScript(script: string): Promise<void> {
    await this.page.evaluate(`() => { ${script} }`);
  }

  @retry({
    maxAttempts: 2,
    backOff: 500,
    doRetry: (error: Error) =>
      error.message.includes(CONTEXT_WAS_DESTROYED_ERROR),
  })
  private async waitForPageToLoad(): Promise<void> {
    logger.debug("Waiting for page to finish loading:");
    await this.page.evaluate(PlaywrightDriver.WAITER_SCRIPT);
    const error: unknown = await this.page.evaluate(
      `(${PlaywrightDriver.WAIT_FOR_SCRIPT})()`
    );
    if (error) {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      logger.debug(`  <- Failed to wait for page to load: ${String(error)}`);
    } else {
      logger.debug("  <- Page finished loading");
    }
  }

  private async autoswitchToNewTab(action: () => Promise<void>): Promise<void> {
    const [newPage] = await Promise.all([
      this.page
        .context()
        .waitForEvent("page", { timeout: this.newTabTimeout })
        .catch(() => null),
      action(),
    ]);

    if (newPage) {
      logger.debug(
        `Auto-switching to new tab ${newPage.url()} (${await newPage.title()})`
      );
      this.page = newPage;
      await this.initCDPSession();
    }
  }

  private getAllFrameIds(frameInfo: CDPFrameInfo): string[] {
    const frameIds: string[] = [frameInfo.frame.id];
    for (const child of frameInfo.childFrames || []) {
      frameIds.push(...this.getAllFrameIds(child));
    }
    return frameIds;
  }

  private getAllFrameUrls(frameInfo: CDPFrameInfo): string[] {
    const urls: string[] = [frameInfo.frame.url || ""];
    for (const child of frameInfo.childFrames || []) {
      urls.push(...this.getAllFrameUrls(child));
    }
    return urls;
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
      await this.client.send("DOM.enable");
      try {
        const ownerInfo = await this.client.send("DOM.getFrameOwner", {
          frameId,
        });
        frameToIframeMap.set(frameId, ownerInfo.backendNodeId);
        logger.debug(
          `Frame ${frameId.slice(0, 20)}... owned by iframe backendNodeId=${ownerInfo.backendNodeId}`
        );
      } catch (error) {
        logger.debug(
          `Could not get frame owner for ${frameId.slice(0, 20)}...: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      if (parentFrameId) {
        frameParentMap.set(frameId, parentFrameId);
      }
    }

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
      chain.unshift(iframeBackendNodeId);
      if (frameParentMap.has(currentFrameId)) {
        currentFrameId = frameParentMap.get(currentFrameId)!;
      } else {
        break;
      }
    }

    return chain;
  }

  private getOopifTargets(
    targets: { targetInfos?: Array<{ type?: string; url?: string }> },
    frameTree: CDPFrameTree
  ): Array<{ url?: string; type?: string }> {
    const frameUrls = new Set(this.getAllFrameUrls(frameTree.frameTree));
    const oopifTargets: Array<{ url?: string; type?: string }> = [];

    for (const target of targets.targetInfos || []) {
      if (target.type === "iframe") {
        const url = target.url || "";
        if (url && !frameUrls.has(url)) {
          oopifTargets.push(target);
          logger.debug(`Detected OOPIF target: ${url.slice(0, 60)}`);
        }
      }
    }

    return oopifTargets;
  }

  private async getCrossOriginFrameNodes(oopifTarget: {
    url?: string;
  }): Promise<CDPNode[]> {
    const url = oopifTarget.url || "";

    const frame = this.findPlaywrightFrameByUrl(url);
    if (!frame) {
      logger.debug(
        `Could not find Playwright frame for URL: ${url.slice(0, 60)}`
      );
      return [];
    }

    const iframeBackendNodeId = await this.getIframeBackendNodeIdByUrl(url);
    return await this.queryFrameInteractiveElements(frame, iframeBackendNodeId);
  }

  private findPlaywrightFrameByUrl(frameUrl: string): Frame | null {
    for (const frame of this.page.frames()) {
      if (frame.url() === frameUrl) {
        return frame;
      }
    }
    if (frameUrl === "about:blank") {
      for (const frame of this.page.frames()) {
        if (frame.url() === "about:blank" || !frame.url()) {
          return frame;
        }
      }
    }
    logger.debug(`Could not find Playwright frame for URL: ${frameUrl}`);
    return null;
  }

  private async getIframeBackendNodeIdByUrl(
    url: string
  ): Promise<number | null> {
    try {
      await this.client.send("DOM.enable");
      const doc = await this.client.send("DOM.getDocument");
      const result = await this.client.send("DOM.querySelectorAll", {
        nodeId: doc.root.nodeId,
        selector: `iframe[src='${url}']`,
      });

      if (result.nodeIds && result.nodeIds.length > 0) {
        const nodeId = result.nodeIds[0];
        const node = await this.client.send("DOM.describeNode", { nodeId });
        return node.node?.backendNodeId ?? null;
      }
    } catch (error) {
      logger.debug(
        `Could not get iframe backendNodeId: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    return null;
  }

  private async queryFrameInteractiveElements(
    frame: Frame,
    iframeBackendNodeId: number | null
  ): Promise<CDPNode[]> {
    const nodes: CDPNode[] = [];
    let nodeId = -1;

    try {
      const interactiveSelectors: Array<[string, string]> = [
        ["button", "button"],
        ["a", "link"],
        ["[role='button']", "button"],
        ["[role='link']", "link"],
        ["input[type='submit']", "button"],
        ["input:not([type='hidden'])", "textbox"],
        ["select", "combobox"],
        ["textarea", "textbox"],
        ["[aria-label]", "generic"],
      ];

      for (const [selector, role] of interactiveSelectors) {
        try {
          const elements = frame.locator(selector);
          const count = await elements.count();
          for (let i = 0; i < Math.min(count, 20); i++) {
            const element = elements.nth(i);
            try {
              const text = await element.textContent({ timeout: 1000 });
              const ariaLabel = await element.getAttribute("aria-label", {
                timeout: 1000,
              });
              const name = ariaLabel || (text ? text.trim().slice(0, 50) : "");

              if (name) {
                const syntheticNode: CDPNode = {
                  nodeId: String(nodeId),
                  role: { value: role },
                  name: { value: name },
                  _playwright_node: true,
                  _locator_info: { selector, nth: i },
                  _frame: frame,
                };

                if (iframeBackendNodeId !== null) {
                  syntheticNode._frame_chain = [iframeBackendNodeId];
                }

                nodes.push(syntheticNode);
                nodeId--;
                logger.debug(`  -> Found ${role}: ${name.slice(0, 40)}`);
              }
            } catch {
              // Element query failed, skip
            }
          }
        } catch {
          // Selector query failed, skip
        }
      }

      logger.debug(
        `  -> Created ${nodes.length} synthetic nodes for cross-origin frame`
      );
    } catch (error) {
      logger.error(
        `  -> Failed to query frame content: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return nodes;
  }

  private findCdpFrameIdByUrl(
    cdpFrameTree: CDPFrameTree,
    targetUrl: string
  ): string | null {
    const searchFrame = (frameInfo: CDPFrameInfo): string | null => {
      if (frameInfo.frame.url === targetUrl) {
        return frameInfo.frame.id;
      }

      for (const child of frameInfo.childFrames || []) {
        const result = searchFrame(child);
        if (result) return result;
      }
      return null;
    };

    return searchFrame(cdpFrameTree.frameTree);
  }

  private findElementByLocatorInfo(
    frame: Frame,
    locatorInfo: Record<string, unknown>
  ): Locator {
    // Handle synthetic frame nodes
    if (locatorInfo._synthetic_frame) {
      const frameUrl =
        typeof locatorInfo._frame_url === "string"
          ? locatorInfo._frame_url
          : "";
      logger.debug(
        `Synthetic frame node clicked, returning frame locator for: ${frameUrl.slice(0, 80)}`
      );
      return frame.locator("body");
    }

    // Handle selector+nth-based locators (from queried frame content)
    if (
      typeof locatorInfo.selector === "string" &&
      typeof locatorInfo.nth === "number"
    ) {
      const selector = locatorInfo.selector;
      const nth = locatorInfo.nth;
      logger.debug(`Finding element by selector: ${selector} (nth=${nth})`);
      return frame.locator(selector).nth(nth);
    }

    const role = locatorInfo.role;
    const name = locatorInfo.name;

    logger.debug(
      `Finding element by locator info: role=${String(role)}, name=${String(name)}`
    );

    // Use Playwright's getByRole for accessibility-based element finding
    if (typeof role === "string" && typeof name === "string") {
      return frame.getByRole(role as never, { name });
    } else if (typeof role === "string") {
      return frame.getByRole(role as never);
    } else if (typeof name === "string") {
      return frame.getByText(name);
    } else {
      throw new Error(
        `Cannot find element: no role or name in locator_info: ${JSON.stringify(locatorInfo)}`
      );
    }
  }
}
