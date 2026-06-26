import { always, ensure } from "alwaysly";
import type { CDPSession, Frame, Locator, Page } from "playwright-core";
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
import type { Keys } from "./keys.ts";
// NOTE: While macros work well in Bun, it fails when using Alumnium client from
// Node.js. A solution could be "node:sea" module, but current Bun version
// doesn't support it. For now, we bundle assets with scripts/generate.ts.
// import { readScript } from "./scripts/scripts.js" with { type: "macro" };
import { AppId } from "../AppId.ts";
import { Env } from "../Env.ts";
import { Telemetry } from "../telemetry/Telemetry.ts";
import type { Tracer } from "../telemetry/Tracer.ts";
import { retry } from "../utils/retry.ts";
import type { Driver } from "./Driver.ts";
import {
  waiterScriptSource,
  waitForScriptSource,
} from "./scripts/bundledScripts.ts";

const { tracer, logger } = Telemetry.get(import.meta.url);
const { span } = tracer.dec();

interface CDPNode {
  nodeId: string;
  parentId?: string | null;
  role?: { value?: string };
  name?: { value?: string };
  childIds?: string[];
  _frame?: object;
  _parent_iframe_backend_node_id?: number | undefined;
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

const CONTEXT_WAS_DESTROYED_ERROR = "Execution context was destroyed";

const WAITER_SCRIPT = waiterScriptSource; // await readScript("waiter.js");
const WAIT_FOR_SCRIPT = `(...scriptArgs) => new Promise((resolve) => { const arguments = [...scriptArgs, resolve]; ${waitForScriptSource /* await readScript("waitFor.js") */} })`;

const RETRY_OPTIONS: retry.Options = {
  maxAttempts: 2,
  backOff: 500,
  doRetry: (error) => error.message.includes(CONTEXT_WAS_DESTROYED_ERROR),
};

export class PlaywrightDriver extends BaseDriver {
  private client!: CDPSession;
  page: Page;
  private _pages: Page[] = [];
  // frameId → url for OOPIF frames tracked via Target.attachedToTarget events
  private oopifFrameIds: Map<string, string> = new Map();
  // Playwright Frame objects that correspond to OOPIFs (populated during getAccessibilityTree)
  private oopifFrames: Set<Frame> = new Set();
  public platform: Driver.Platform = "chromium";
  public supportedTools: Set<ToolClass> = new Set([
    ClickTool,
    DragAndDropTool,
    HoverTool,
    PressKeyTool,
    TypeTool,
    UploadTool,
  ]);
  public newTabTimeout = Env.ALUMNIUM_PLAYWRIGHT_NEW_TAB_TIMEOUT;
  public autoswitchToNewTab = true;
  public fullPageScreenshot = Env.ALUMNIUM_FULL_PAGE_SCREENSHOT;

  constructor(page: Page) {
    super();
    this.page = page;
    this.setupPageTracking(page);
    void this.initCDPSession();
  }

  private setupPageTracking(initialPage: Page): void {
    this._pages = [initialPage];
    this.attachPageListeners(initialPage);
  }

  private attachPageListeners(page: Page): void {
    page.on("popup", (popup) => this.onPopup(popup));
    page.on("close", (popup) => this.onPageClose(popup));
  }

  private onPopup(popup: Page) {
    logger.debug(`New popup opened: ${popup.url()}`);
    this._pages.push(popup);
    this.attachPageListeners(popup); // Chain: new page also listens for popups
  }

  private onPageClose(page: Page): void {
    const index = this._pages.indexOf(page);
    if (index !== -1) {
      logger.debug(`Page closed: ${page.url()}`);
      this._pages.splice(index, 1);
    }
  }

  private async initCDPSession(): Promise<void> {
    this.oopifFrameIds.clear();
    this.oopifFrames.clear();
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

      // Track OOPIF frames: they arrive as attached targets of type "iframe"
      // but are absent from Page.getFrameTree because they run in a separate
      // renderer process. The URL is often empty at attach time; it gets
      // updated via Page.frameNavigated events.
      this.client.on(
        "Target.attachedToTarget",
        (event: {
          targetInfo: { type: string; targetId: string; url: string };
          sessionId: string;
        }) => {
          if (event.targetInfo.type === "iframe") {
            logger.debug(
              `OOPIF attached: frameId=${event.targetInfo.targetId} url=${event.targetInfo.url || "(empty)"}`,
            );
            this.oopifFrameIds.set(
              event.targetInfo.targetId,
              event.targetInfo.url,
            );
          }
        },
      );

      this.client.on(
        "Target.detachedFromTarget",
        (event: { targetId?: string }) => {
          if (event.targetId && this.oopifFrameIds.has(event.targetId)) {
            logger.debug(`OOPIF detached: frameId=${event.targetId}`);
            this.oopifFrameIds.delete(event.targetId);
          }
        },
      );

      // Update URLs as OOPIF frames navigate (the initial attach URL is often empty)
      this.client.on(
        "Page.frameNavigated",
        (event: { frame: { id: string; url: string }; type: string }) => {
          if (this.oopifFrameIds.has(event.frame.id)) {
            logger.debug(
              `OOPIF navigated: frameId=${event.frame.id} url=${event.frame.url}`,
            );
            this.oopifFrameIds.set(event.frame.id, event.frame.url);
          }
        },
      );

      logger.debug("Enabled Target.setAutoAttach for OOPIF support");
    } catch (error) {
      logger.debug(
        `Could not enable Target.setAutoAttach: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @span("driver.get_accessibility_tree", spanAttrs)
  async getAccessibilityTree(): Promise<BaseAccessibilityTree> {
    await this.waitForPageToLoad();

    const frameTree = (await this.client.send(
      "Page.getFrameTree",
    )) as CDPFrameTree;
    const frameIds = this.getAllFrameIds(frameTree.frameTree);
    const mainFrameId = frameTree.frameTree.frame.id;
    logger.debug(
      `Found ${frameIds.length} same-process frames, ${this.oopifFrameIds.size} OOPIFs`,
    );

    const frameToIframeMap = await this.buildFrameOwnerMap(
      frameTree.frameTree,
      mainFrameId,
    );
    const frameIdToPlaywrightFrame =
      await this.buildPlaywrightFrameMap(frameTree);

    const allNodes: CDPNode[] = [];
    let frameIndex = 0;

    for (const frameId of frameIds) {
      const playwrightFrame =
        frameIdToPlaywrightFrame.get(frameId) ?? this.page.mainFrame();
      const nodes = await this.getFrameNodes(frameId, playwrightFrame);
      this.mergeFrameNodes(
        nodes,
        frameId,
        frameToIframeMap,
        playwrightFrame,
        frameIndex++,
        allNodes,
      );
    }

    for (const oopifFrameId of this.oopifFrameIds.keys()) {
      const playwrightFrame = frameIdToPlaywrightFrame.get(oopifFrameId);
      if (!playwrightFrame) continue;
      const nodes = await this.getOopifNodes(oopifFrameId, playwrightFrame);
      this.mergeFrameNodes(
        nodes,
        oopifFrameId,
        frameToIframeMap,
        playwrightFrame,
        frameIndex++,
        allNodes,
      );
    }

    return new ChromiumAccessibilityTree({ nodes: allNodes });
  }

  @span("driver.click", spanAttrs)
  async click(id: number): Promise<void> {
    const element = await this.findElement(id);
    const tagName = await element.evaluate(
      (el: { tagName: string }) => el.tagName,
    );
    if (tagName?.toLowerCase() === "option") {
      const value = await element.evaluate((el: { value: string }) => el.value);
      await this.autoswitchToNewTabAction(async () => {
        await element.locator("xpath=ancestor::select").selectOption(value);
      });
    } else {
      await this.autoswitchToNewTabAction(async () => {
        await element.click({ force: true });
      });
    }
  }

  @span("driver.drag_slider", spanAttrs)
  async dragSlider(id: number, value: number): Promise<void> {
    const element = await this.findElement(id);
    await element.fill(String(value));
  }

  @span("driver.drag_and_drop", spanAttrs)
  async dragAndDrop(fromId: number, toId: number): Promise<void> {
    const fromElement = await this.findElement(fromId);
    const toElement = await this.findElement(toId);
    await fromElement.dragTo(toElement);
  }

  @span("driver.hover", spanAttrs)
  async hover(id: number): Promise<void> {
    const element = await this.findElement(id);
    await element.hover();
  }

  @span("driver.press_key", spanAttrs)
  async pressKey(key: Keys.Key): Promise<void> {
    await this.autoswitchToNewTabAction(() =>
      this.page.keyboard.press(key),
    );
  }

  @span("driver.quit", spanAttrs)
  async quit(): Promise<void> {
    return this.page.close();
  }

  @span("driver.back", spanAttrs)
  async back(): Promise<void> {
    await this.page.goBack();
  }

  @span("driver.visit", spanAttrs)
  async visit(url: string): Promise<void> {
    await this.page.goto(url);
  }

  @span("driver.scroll_to", spanAttrs)
  async scrollTo(id: number): Promise<void> {
    const element = await this.findElement(id);
    await element.scrollIntoViewIfNeeded();
  }

  @span("driver.screenshot", spanAttrs)
  async screenshot(): Promise<string> {
    return retry(RETRY_OPTIONS, async () => {
      const buffer = await this.page.screenshot({
        fullPage: this.fullPageScreenshot,
      });
      return buffer.toString("base64");
    });
  }

  @span("driver.title", spanAttrs)
  async title(): Promise<string> {
    return retry(RETRY_OPTIONS, () => this.page.title());
  }

  @span("driver.type", spanAttrs)
  async type(id: number, text: string): Promise<void> {
    const element = await this.findElement(id);
    await element.fill(text);
  }

  @span("driver.upload", spanAttrs)
  async upload(id: number, paths: string[]): Promise<void> {
    const element = await this.findElement(id);
    const [fileChooser] = await Promise.all([
      this.page.waitForEvent("filechooser", { timeout: 5000 }),
      element.click({ force: true }),
    ]);
    await fileChooser.setFiles(paths);
  }

  @span("driver.url", spanAttrs)
  url(): Promise<string> {
    return retry(RETRY_OPTIONS, async () => this.page.url());
  }

  @span("driver.app", spanAttrs)
  async app(): Promise<AppId> {
    return AppId.parse(this.page.url());
  }

  @span("driver.find_element", spanAttrs)
  async findElement(id: number): Promise<Locator> {
    const tree = await this.getAccessibilityTree();
    const accessibilityElement = tree.elementById(id);

    // Get frame reference (default to main frame)
    const frame = (accessibilityElement.frame ||
      this.page.mainFrame()) as Frame;

    const backendNodeId = accessibilityElement.backendNodeId!;

    // OOPIF elements live in a separate renderer process — the main CDP session
    // cannot resolve their backendNodeIds. Use a per-frame session instead.
    const isOopif = frame !== this.page.mainFrame() && this.isOopifFrame(frame);
    const session = isOopif
      ? await this.page.context().newCDPSession(frame)
      : this.client;

    // Beware!
    await session.send("DOM.enable");
    await session.send("DOM.getFlattenedDocument");
    const nodeIds = await session.send("DOM.pushNodesByBackendIdsToFrontend", {
      backendNodeIds: [backendNodeId],
    });
    const nodeId = nodeIds.nodeIds[0];
    ensure(nodeId);
    await session.send("DOM.setAttributeValue", {
      nodeId,
      name: "data-alumnium-id",
      value: String(backendNodeId),
    });

    if (isOopif) await session.detach();

    // TODO: We need to remove the attribute after we are done with the element,
    // but Playwright locator is lazy and we cannot guarantee when it is safe to do so.
    return frame.locator(`css=[data-alumnium-id='${backendNodeId}']`);
  }

  private isOopifFrame(frame: Frame): boolean {
    return this.oopifFrames.has(frame);
  }

  // Build frameId -> backendNodeId map for all non-main frames so nodes can be
  // stitched back to their parent <iframe> element in the merged tree.
  private async buildFrameOwnerMap(
    frameInfo: CDPFrameInfo,
    mainFrameId: string,
  ): Promise<Map<string, number>> {
    const map: Map<string, number> = new Map();
    await this.client.send("DOM.enable");

    const walk = async (fi: CDPFrameInfo) => {
      if (fi.frame.id !== mainFrameId) {
        try {
          const owner = await this.client.send("DOM.getFrameOwner", {
            frameId: fi.frame.id,
          });
          map.set(fi.frame.id, owner.backendNodeId);
          logger.debug(
            `Frame ${fi.frame.id.slice(0, 20)}... owned by iframe backendNodeId=${owner.backendNodeId}`,
          );
        } catch (error) {
          logger.debug(
            `Could not get frame owner for ${fi.frame.id.slice(0, 20)}...: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      for (const child of fi.childFrames || []) await walk(child);
    };
    await walk(frameInfo);

    // OOPIFs: their <iframe> element lives in the main DOM, so the main session resolves it fine.
    for (const oopifFrameId of this.oopifFrameIds.keys()) {
      try {
        const owner = await this.client.send("DOM.getFrameOwner", {
          frameId: oopifFrameId,
        });
        map.set(oopifFrameId, owner.backendNodeId);
        logger.debug(
          `OOPIF ${oopifFrameId.slice(0, 20)}... owned by iframe backendNodeId=${owner.backendNodeId}`,
        );
      } catch (error) {
        logger.debug(
          `Could not get frame owner for OOPIF ${oopifFrameId.slice(0, 20)}...: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return map;
  }

  // Build frameId -> Playwright Frame map for same-origin and OOPIF frames.
  private async buildPlaywrightFrameMap(
    frameTree: CDPFrameTree,
  ): Promise<Map<string, Frame>> {
    const map: Map<string, Frame> = new Map();

    for (const frame of this.page.frames()) {
      const cdpFrameId = this.findCdpFrameIdByUrl(frameTree, frame.url());
      if (cdpFrameId) map.set(cdpFrameId, frame);
    }

    // OOPIFs are absent from Page.getFrameTree, so URL matching won't work.
    // Open a per-frame CDP session and compare root frame ids.
    const unmappedOopifs = new Set(
      [...this.oopifFrameIds.keys()].filter((id) => !map.has(id)),
    );
    if (unmappedOopifs.size > 0) {
      for (const playwrightFrame of this.page.frames()) {
        if (playwrightFrame === this.page.mainFrame()) continue;
        if ([...map.values()].includes(playwrightFrame)) continue;

        try {
          const frameSession = await this.page
            .context()
            .newCDPSession(playwrightFrame);
          const ft = (await frameSession.send(
            "Page.getFrameTree",
          )) as CDPFrameTree;
          await frameSession.detach();

          const rootFrameId = ft.frameTree.frame.id;
          if (unmappedOopifs.has(rootFrameId)) {
            map.set(rootFrameId, playwrightFrame);
            this.oopifFrames.add(playwrightFrame);
            unmappedOopifs.delete(rootFrameId);
            logger.debug(
              `Mapped OOPIF ${rootFrameId.slice(0, 20)}... to Playwright frame`,
            );
          }
        } catch {
          // frame may have been destroyed
        }
      }
    }

    return map;
  }

  // Namespace and append a frame's nodes into allNodes to prevent id collisions.
  private mergeFrameNodes(
    nodes: CDPNode[],
    frameId: string,
    frameToIframeMap: Map<string, number>,
    playwrightFrame: Frame,
    frameIndex: number,
    allNodes: CDPNode[],
  ): void {
    const prefix = `f${frameIndex}:`;
    for (const node of nodes) {
      node.nodeId = prefix + node.nodeId;
      if (node.parentId != null) node.parentId = prefix + node.parentId;
      if (node.childIds) node.childIds = node.childIds.map((id) => prefix + id);
      node._frame = playwrightFrame;
      if (node.parentId === undefined && frameToIframeMap.has(frameId)) {
        node._parent_iframe_backend_node_id = frameToIframeMap.get(frameId);
      }
      allNodes.push(node);
    }
  }

  @span("driver.execute_script", spanAttrs)
  async executeScript(script: string): Promise<void> {
    await this.page.evaluate(`() => { ${script} }`);
  }

  @span("driver.print_to_pdf", spanAttrs)
  async printToPdf(filepath: string): Promise<void> {
    await this.page.pdf({ path: filepath });
  }

  @span("driver.switch_to_next_tab", spanAttrs)
  async switchToNextTab(): Promise<void> {
    // Brief wait to allow popup handlers to complete
    await this.page.waitForTimeout(100);
    if (this._pages.length <= 1) {
      return; // Only one tab, nothing to switch
    }

    const currentIndex = this._pages.indexOf(this.page);
    const nextIndex = (currentIndex + 1) % this._pages.length; // Wrap to first

    always(this._pages[nextIndex]);
    this.page = this._pages[nextIndex];
    await this.initCDPSession();
    await this.page.waitForLoadState();
  }

  @span("driver.switch_to_previous_tab", spanAttrs)
  async switchToPreviousTab(): Promise<void> {
    // Brief wait to allow popup handlers to complete
    await this.page.waitForTimeout(100);
    if (this._pages.length <= 1) {
      return; // Only one tab, nothing to switch
    }

    const currentIndex = this._pages.indexOf(this.page);
    const prevIndex =
      (currentIndex - 1 + this._pages.length) % this._pages.length; // Wrap to last

    always(this._pages[prevIndex]);
    this.page = this._pages[prevIndex];
    await this.initCDPSession();
    await this.page.waitForLoadState();
  }

  @span("driver.wait", spanAttrs)
  async wait(seconds: number): Promise<void> {
    const clampedSeconds = Math.max(1, Math.min(30, seconds));
    await new Promise((resolve) => setTimeout(resolve, clampedSeconds * 1000));
  }

  @span("driver.wait_for_selector", spanAttrs)
  async waitForSelector(selector: string, timeout?: number): Promise<void> {
    const timeoutMs = (timeout ?? 10) * 1000;
    await this.page.waitForSelector(selector, {
      state: "visible",
      timeout: timeoutMs,
    });
  }

  async grantPermissions(permissions: string[]): Promise<void> {
    await this.page.context().grantPermissions(permissions);
  }

  @span("driver.wait_for_page_to_load", spanAttrs)
  private async waitForPageToLoad(): Promise<void> {
    return retry(RETRY_OPTIONS, async () => {
      logger.debug("Waiting for page to finish loading:");
      await this.page.evaluate(WAITER_SCRIPT);
      const error: unknown = await this.page.evaluate(`(${WAIT_FOR_SCRIPT})()`);
      if (error) {
        logger.debug(`  <- Failed to wait for page to load: ${String(error)}`);
      } else {
        logger.debug("  <- Page finished loading");
      }
    });
  }

  private async autoswitchToNewTabAction(
    action: () => Promise<void>,
  ): Promise<void> {
    if (!this.autoswitchToNewTab) {
      await action();
      return;
    }

    const [newPage] = await Promise.all([
      this.page
        .context()
        .waitForEvent("page", { timeout: this.newTabTimeout })
        .catch(() => null),
      action(),
    ]);

    if (newPage) {
      logger.debug(
        `Auto-switching to new tab ${newPage.url()} (${await newPage.title()})`,
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

  private findCdpFrameIdByUrl(
    cdpFrameTree: CDPFrameTree,
    targetUrl: string,
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

  private async getFrameNodes(
    frameId: string,
    playwrightFrame: Frame,
  ): Promise<CDPNode[]> {
    try {
      const response = (await this.client.send("Accessibility.getFullAXTree", {
        frameId,
      })) as { nodes: CDPNode[] };
      const nodes = response.nodes || [];
      logger.debug(
        `  -> Frame ${frameId.slice(0, 20)}...: ${nodes.length} nodes`,
      );
      return nodes;
    } catch (error) {
      logger.debug(
        `  -> Frame ${frameId.slice(0, 20)}...: failed (${error instanceof Error ? error.message : String(error)})`,
      );
      return [];
    }
  }

  private async getOopifNodes(
    frameId: string,
    playwrightFrame: Frame,
  ): Promise<CDPNode[]> {
    try {
      // OOPIFs run in a separate renderer process — open a per-frame CDP session
      // scoped to that target, then call getFullAXTree without a frameId parameter.
      const frameSession = await this.page
        .context()
        .newCDPSession(playwrightFrame);
      const response = (await frameSession.send(
        "Accessibility.getFullAXTree",
        {},
      )) as { nodes: CDPNode[] };
      const nodes = response.nodes || [];
      logger.debug(
        `  -> OOPIF ${frameId.slice(0, 20)}...: got ${nodes.length} nodes`,
      );
      await frameSession.detach();
      return nodes;
    } catch (oopifError) {
      logger.debug(
        `  -> OOPIF ${frameId.slice(0, 20)}...: failed (${oopifError instanceof Error ? oopifError.message : String(oopifError)})`,
      );
      return [];
    }
  }
}

function spanAttrs(this: PlaywrightDriver): Tracer.SpansDriverAttrs {
  return {
    "driver.kind": "playwright",
    "driver.platform": this.platform,
  };
}
