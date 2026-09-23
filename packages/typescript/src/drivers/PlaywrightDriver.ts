import { ensure } from "alwaysly";
import type {
  BrowserContext,
  CDPSession,
  Frame,
  Locator,
  Page,
} from "playwright-core";
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
import { TreeDevDrillError } from "../tree/dev/TreeDevDrillError.ts";
import { retry } from "../utils/retry.ts";
import {
  CdpNetworkMonitor,
  WAITER_SNAPSHOT_SCRIPT,
  waitForPageStability,
} from "./CdpNetworkMonitor.ts";
import { waiterScriptSource } from "./scripts/bundledScripts.ts";
import { PlaywrightNetworkMonitor } from "./PlaywrightNetworkMonitor.ts";

const { tracer, logger } = Telemetry.get(import.meta.url);
const { span } = tracer.dec();
const stateful = BaseDriver.stateful;

interface CDPNode {
  nodeId: string;
  parentId?: string | null;
  role?: { value?: string };
  name?: { value?: string };
  childIds?: string[];
  _frame?: object;
  _parent_iframe_backend_node_id?: number | undefined;
  backendDOMNodeId?: number;
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

interface HTMLElement {
  tagName: string;
  value: string;
  scrollIntoView: (options: {
    block: "start" | "center" | "end" | "nearest";
  }) => void;
}

interface NewTabAction {
  announced: boolean;
  pages: Page[];
}

const CONTEXT_WAS_DESTROYED_ERROR = "Execution context was destroyed";
const NEW_TAB_DELAY = 200;

const WAITER_SCRIPT = waiterScriptSource; // await readScript("waiter.js");
const NETWORK_EVENTS = [
  "Network.requestWillBeSent",
  "Network.responseReceived",
  "Network.dataReceived",
  "Network.loadingFinished",
  "Network.loadingFailed",
] as const;

const RETRY_OPTIONS: retry.Options = {
  maxAttempts: 2,
  backOff: 500,
  doRetry: (error) => error.message.includes(CONTEXT_WAS_DESTROYED_ERROR),
};

export class PlaywrightDriver extends BaseDriver {
  private client!: CDPSession;
  private cdpReady: Promise<void>;
  private networkMonitor: CdpNetworkMonitor;
  #network: PlaywrightNetworkMonitor;
  #pageSessions = new Map<Page, Promise<CDPSession>>();
  #pageOopifFrameIds = new WeakMap<Page, Map<string, string>>();
  #attachingFrames = new Set<Frame>();
  private networkSessions = new Map<Frame, CDPSession>();
  private networkFrameIds = new WeakMap<Frame, number>();
  private nextNetworkFrameId = 1;
  private cdpGeneration = 0;
  page: Page;
  private trackedPages = new Set<Page>();
  #previousPage: Page | undefined;
  private newTabAction: NewTabAction | undefined;
  // frameId → url for OOPIF frames tracked via Target.attachedToTarget events
  private oopifFrameIds: Map<string, string> = new Map();
  // Playwright Frame objects that correspond to OOPIFs (populated during getAccessibilityTree)
  private oopifFrames: Set<Frame> = new Set();
  kind = "playwright" as const;
  platform = "chromium" as const;
  public supportedTools: Set<ToolClass> = new Set([
    ClickTool,
    DragAndDropTool,
    HoverTool,
    PressKeyTool,
    TypeTool,
    UploadTool,
  ]);
  public newTabTimeout = 10_000;
  public autoswitchToNewTab = true;
  public fullPageScreenshot = Env.ALUMNIUM_FULL_PAGE_SCREENSHOT;

  constructor(page: Page) {
    super();
    this.page = page;
    this.#network = new PlaywrightNetworkMonitor(page.context());
    this.networkMonitor = this.#network.forPage(page);
    this.cdpReady = Promise.resolve(
      this.page.context().addInitScript({ content: WAITER_SCRIPT }),
    ).then(() => this.initCDPSession());

    this.page.context().on("page", (opened) => this.onPageOpened(opened));
    this.trackPage(page);
  }

  private trackPage(page: Page): void {
    if (this.trackedPages.has(page)) return;
    this.trackedPages.add(page);
    page.on("frameattached", (frame) => void this.attachNetworkFrame(frame));
    page.on("framenavigated", (frame) => void this.attachNetworkFrame(frame));
    page.on("framedetached", (frame) => this.detachNetworkFrame(frame));
    page.on("close", () => this.onPageClose(page));
  }

  private onPageOpened(page: Page): void {
    logger.debug(`New tab opened: ${page.url()}`);
    this.trackPage(page);
    this.newTabAction?.pages.push(page);
    void this.#initPageNetwork(page).catch((error) => {
      logger.debug(
        `Could not initialize new tab network tracking: ${String(error)}`,
      );
    });
  }

  private onPageClose(page: Page): void {
    logger.debug(`Page closed: ${page.url()}`);
    this.trackedPages.delete(page);
    for (const frame of this.networkSessions.keys()) {
      if (frame.page() === page) this.detachNetworkFrame(frame);
    }
    const session = this.#pageSessions.get(page);
    this.#pageSessions.delete(page);
    this.#pageOopifFrameIds.delete(page);
    void session?.then((client) => client.detach()).catch(() => undefined);
    if (this.newTabAction)
      this.newTabAction.pages = this.newTabAction.pages.filter(
        (opened) => opened !== page,
      );
    if (page !== this.page) return;
    const previous = this.#previousPage;
    if (!previous || previous.isClosed()) return;
    this.page = previous;
    this.#previousPage = undefined;
    this.resetAccessibilityTree();
    this.cdpReady = this.initCDPSession().catch((error) => {
      logger.info(`Failed to initialize CDP session: ${String(error)}`);
    });
  }

  private async initCDPSession(): Promise<void> {
    const generation = ++this.cdpGeneration;
    const page = this.page;
    this.oopifFrames.clear();
    const client = await this.#initPageNetwork(page);
    if (generation !== this.cdpGeneration || page !== this.page) {
      return;
    }
    this.client = client;
    this.networkMonitor = this.#network.forPage(page);
    this.oopifFrameIds = this.#pageOopifFrameIds.get(page)!;
    for (const frame of this.page.frames()) {
      if (frame !== this.page.mainFrame()) await this.attachNetworkFrame(frame);
    }
  }

  #initPageNetwork(page: Page): Promise<CDPSession> {
    let session = this.#pageSessions.get(page);
    if (!session) {
      session = this.#createPageSession(page).catch((error) => {
        this.#pageSessions.delete(page);
        throw error;
      });
      this.#pageSessions.set(page, session);
    }
    return session;
  }

  async #createPageSession(page: Page): Promise<CDPSession> {
    const monitor = this.#network.forPage(page);
    const frameIds = new Map<string, string>();
    this.#pageOopifFrameIds.set(page, frameIds);
    const session = await page.context().newCDPSession(page);
    try {
      await this.configureNetworkSession(session, monitor);
      await this.enableTargetAutoAttach(session, frameIds);
      return session;
    } catch (error) {
      await session.detach().catch(() => undefined);
      throw error;
    }
  }

  private async configureNetworkSession(
    session: CDPSession,
    monitor: CdpNetworkMonitor,
    sessionId = "",
  ): Promise<void> {
    for (const event of NETWORK_EVENTS) {
      session.on(event, (params) => monitor.process(event, params, sessionId));
    }
    await session.send("Page.enable");
    await session.send("Network.enable");
    await session.send("Page.addScriptToEvaluateOnNewDocument", {
      source: WAITER_SCRIPT,
      runImmediately: true,
    });
    session.on("Page.windowOpen", () => {
      if (monitor === this.networkMonitor && this.newTabAction)
        this.newTabAction.announced = true;
    });
  }

  private async attachNetworkFrame(frame: Frame): Promise<void> {
    const page = frame.page();
    if (
      page !== this.page ||
      frame === page.mainFrame() ||
      this.networkSessions.has(frame) ||
      this.#attachingFrames.has(frame)
    )
      return;
    this.#attachingFrames.add(frame);
    const monitor = this.#network.forPage(page);
    let session: CDPSession | undefined;
    try {
      const frameTree = (await this.client.send(
        "Page.getFrameTree",
      )) as CDPFrameTree;
      session = await page.context().newCDPSession(frame);
      const sessionFrameTree = (await session.send(
        "Page.getFrameTree",
      )) as CDPFrameTree;
      const sameProcessFrameIds = new Set(
        this.getAllFrameIds(frameTree.frameTree),
      );
      if (sameProcessFrameIds.has(sessionFrameTree.frameTree.frame.id)) {
        await session.detach();
        return;
      }
      await this.configureNetworkSession(
        session,
        monitor,
        this.networkFrameId(frame),
      );
      if (frame.isDetached() || page.isClosed()) {
        monitor.clearSession(this.networkFrameId(frame));
        await session.detach();
        return;
      }
      this.networkSessions.set(frame, session);
    } catch {
      await session?.detach().catch(() => undefined);
      // Same-process or destroyed frames are covered by the page session.
    } finally {
      this.#attachingFrames.delete(frame);
    }
  }

  private detachNetworkFrame(frame: Frame): void {
    const sessionId = this.networkFrameId(frame);
    this.#network.clearSession(frame.page(), sessionId);
    const session = this.networkSessions.get(frame);
    if (session) void session.detach().catch(() => undefined);
    this.networkSessions.delete(frame);
  }

  private networkFrameId(frame: Frame): string {
    let id = this.networkFrameIds.get(frame);
    if (!id) {
      id = this.nextNetworkFrameId++;
      this.networkFrameIds.set(frame, id);
    }
    return `frame:${id}`;
  }

  private async enableTargetAutoAttach(
    client: CDPSession,
    frameIds: Map<string, string>,
  ): Promise<void> {
    try {
      // Track OOPIF frames: they arrive as attached targets of type "iframe"
      // but are absent from Page.getFrameTree because they run in a separate
      // renderer process. The URL is often empty at attach time; it gets
      // updated via Page.frameNavigated events.
      client.on(
        "Target.attachedToTarget",
        (event: {
          targetInfo: { type: string; targetId: string; url: string };
          sessionId: string;
        }) => {
          if (event.targetInfo.type === "iframe") {
            logger.debug(
              `OOPIF attached: frameId=${event.targetInfo.targetId} url=${event.targetInfo.url || "(empty)"}`,
            );
            frameIds.set(event.targetInfo.targetId, event.targetInfo.url);
          }
        },
      );

      client.on("Target.detachedFromTarget", (event: { targetId?: string }) => {
        if (event.targetId && frameIds.has(event.targetId)) {
          logger.debug(`OOPIF detached: frameId=${event.targetId}`);
          frameIds.delete(event.targetId);
        }
      });

      // Update URLs as OOPIF frames navigate (the initial attach URL is often empty)
      client.on(
        "Page.frameNavigated",
        (event: { frame: { id: string; url: string }; type: string }) => {
          if (frameIds.has(event.frame.id)) {
            logger.debug(
              `OOPIF navigated: frameId=${event.frame.id} url=${event.frame.url}`,
            );
            frameIds.set(event.frame.id, event.frame.url);
          }
        },
      );

      await client.send("Target.setAutoAttach", {
        autoAttach: true,
        waitForDebuggerOnStart: false,
        flatten: true,
      });
      logger.debug("Enabled Target.setAutoAttach for OOPIF support");
    } catch (error) {
      logger.debug(
        `Could not enable Target.setAutoAttach: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @span("driver.fetch_accessibility_tree", BaseDriver.spanAttrs)
  protected async fetchAccessibilityTree(): Promise<BaseAccessibilityTree> {
    await this.cdpReady;
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

  @span("driver.click", BaseDriver.spanAttrs)
  @stateful
  async click(id: number): Promise<void> {
    const element = await this.findElement(id);
    const tagName = await element.evaluate((el: HTMLElement) => el.tagName);
    if (tagName?.toLowerCase() === "option") {
      const value = await element.evaluate((el: HTMLElement) => el.value);
      await this.autoswitchToNewTabAction(async () => {
        await element.locator("xpath=ancestor::select").selectOption(value);
      });
    } else {
      await this.autoswitchToNewTabAction(async () => {
        await this.#scrollElementIfNeeded(element);
        await element.click({ force: true });
      });
    }
  }

  @span("driver.drag_slider", BaseDriver.spanAttrs)
  @stateful
  async dragSlider(id: number, value: number): Promise<void> {
    const element = await this.findElement(id);
    await this.#scrollElementIfNeeded(element);
    await element.fill(String(value));
  }

  @span("driver.drag_and_drop", BaseDriver.spanAttrs)
  @stateful
  async dragAndDrop(fromId: number, toId: number): Promise<void> {
    const fromElement = await this.findElement(fromId);
    const toElement = await this.findElement(toId);
    await this.#scrollElementIfNeeded(fromElement);
    await fromElement.dragTo(toElement);
  }

  @span("driver.hover", BaseDriver.spanAttrs)
  @stateful
  async hover(id: number): Promise<void> {
    const element = await this.findElement(id);
    await this.#scrollElementIntoCenter(element);
    await element.hover();
  }

  @span("driver.press_key", BaseDriver.spanAttrs)
  @stateful
  async pressKey(key: Keys.Key): Promise<void> {
    const keyMap: Record<Keys.Key, string> = {
      Backspace: "Backspace",
      Enter: "Enter",
      Escape: "Escape",
      Tab: "Tab",
    };

    const mappedKey = keyMap[key];
    if (!mappedKey) {
      throw new Error(
        `Unsupported key: "${key}". Supported keys are: ${Object.keys(keyMap).join(", ")}`,
      );
    }

    await this.autoswitchToNewTabAction(() =>
      this.page.keyboard.press(mappedKey),
    );
  }

  @span("driver.quit", BaseDriver.spanAttrs)
  async quit(): Promise<void> {
    await this.cdpReady;
    await this.page.close();
  }

  @span("driver.back", BaseDriver.spanAttrs)
  @stateful
  async back(): Promise<void> {
    await this.page.goBack();
  }

  @span("driver.visit", BaseDriver.spanAttrs)
  @stateful
  async visit(url: string): Promise<void> {
    await this.checkNavigationPolicy(url);
    await this.page.goto(url);
  }

  @span("driver.scroll_to", BaseDriver.spanAttrs)
  @stateful
  async scrollTo(id: number): Promise<void> {
    const element = await this.findElement(id);
    await this.#scrollElementIntoCenter(element);
  }

  @span("driver.screenshot", BaseDriver.spanAttrs)
  async screenshot(): Promise<string> {
    return retry(RETRY_OPTIONS, async () => {
      const buffer = await this.page.screenshot({
        fullPage: this.fullPageScreenshot,
      });
      return buffer.toString("base64");
    });
  }

  @span("driver.title", BaseDriver.spanAttrs)
  async title(): Promise<string> {
    return retry(RETRY_OPTIONS, () => this.page.title());
  }

  @span("driver.type", BaseDriver.spanAttrs)
  @stateful
  async type(id: number, text: string): Promise<void> {
    const element = await this.findElement(id);
    await this.#scrollElementIfNeeded(element);
    await element.fill(text);
  }

  @span("driver.upload", BaseDriver.spanAttrs)
  @stateful
  async upload(id: number, paths: string[]): Promise<void> {
    const element = await this.findElement(id);
    const [fileChooser] = await Promise.all([
      this.page.waitForEvent("filechooser", { timeout: 5000 }),
      element.click({ force: true }),
    ]);
    await fileChooser.setFiles(paths);
  }

  @span("driver.url", BaseDriver.spanAttrs)
  url(): Promise<string> {
    return retry(RETRY_OPTIONS, async () => this.page.url());
  }

  @span("driver.app", BaseDriver.spanAttrs)
  async app(): Promise<AppId> {
    return AppId.parse(this.page.url());
  }

  @span("driver.find_element", BaseDriver.spanAttrs)
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

    try {
      // Beware!
      await session.send("DOM.enable");
      await session.send("DOM.getFlattenedDocument");
      const nodeIds = await session.send(
        "DOM.pushNodesByBackendIdsToFrontend",
        {
          backendNodeIds: [backendNodeId],
        },
      );
      const nodeId = nodeIds.nodeIds[0];
      ensure(nodeId);
      await session.send("DOM.setAttributeValue", {
        nodeId,
        name: "data-alumnium-id",
        value: String(backendNodeId),
      });
    } finally {
      if (isOopif) await session.detach();
    }

    // TODO: We need to remove the attribute after we are done with the element,
    // but Playwright locator is lazy and we cannot guarantee when it is safe to do so.
    return frame.locator(`css=[data-alumnium-id='${backendNodeId}']`);
  }

  async #scrollElementIfNeeded(element: Locator): Promise<void> {
    try {
      logger.debug(`Attempting to hover over element`);
      await element.hover({ trial: true, timeout: 200 });
    } catch (error) {
      logger.debug(error instanceof Error ? error.message : String(error));
      logger.debug(`Hover failed, scrolling into view instead`);
      await this.#scrollElementIntoCenter(element);
    }
  }

  async #scrollElementIntoCenter(element: Locator): Promise<void> {
    await element.evaluate((el: HTMLElement) => {
      el.scrollIntoView({ block: "center" });
    });
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

        let frameSession: CDPSession | undefined;
        try {
          frameSession = await this.page
            .context()
            .newCDPSession(playwrightFrame);
          const ft = (await frameSession.send(
            "Page.getFrameTree",
          )) as CDPFrameTree;

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
        } finally {
          await frameSession?.detach().catch(() => undefined);
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

  @span("driver.execute_script", BaseDriver.spanAttrs)
  @stateful
  async executeScript(script: string): Promise<void> {
    logger.debug("Executing script: {script}", { script });
    await this.page.evaluate(script);
  }

  @span("driver.print_to_pdf", BaseDriver.spanAttrs)
  async printToPdf(filepath: string): Promise<void> {
    await this.page.pdf({ path: filepath });
  }

  @span("driver.switch_to_next_tab", BaseDriver.spanAttrs)
  async switchToNextTab(): Promise<void> {
    await this.page.waitForTimeout(100).catch(() => undefined);
    const pages = this.openTabs();
    if (pages.length <= 1) {
      return; // Only one tab, nothing to switch
    }

    const currentIndex = pages.indexOf(this.page);
    const nextIndex = (currentIndex + 1) % pages.length; // Wrap to first

    await this.switchToTab(pages[nextIndex]);
  }

  @span("driver.switch_to_previous_tab", BaseDriver.spanAttrs)
  async switchToPreviousTab(): Promise<void> {
    await this.page.waitForTimeout(100).catch(() => undefined);
    const pages = this.openTabs();
    if (pages.length <= 1) {
      return; // Only one tab, nothing to switch
    }

    const currentIndex = pages.indexOf(this.page);
    const prevIndex = (currentIndex - 1 + pages.length) % pages.length; // Wrap to last

    await this.switchToTab(pages[prevIndex]);
  }

  @stateful("switchToTab")
  private async switchToTab(page: Page | undefined): Promise<void> {
    if (!page) return;
    await this.activatePage(page);
    await this.page.waitForLoadState();
  }

  private async activatePage(page: Page): Promise<void> {
    await this.cdpReady;
    if (page !== this.page) this.#previousPage = this.page;
    this.page = page;
    this.trackPage(page);
    this.resetAccessibilityTree();
    this.cdpReady = this.initCDPSession();
    await this.cdpReady;
  }

  private openTabs(): Page[] {
    return this.page
      .context()
      .pages()
      .filter((page) => !page.isClosed());
  }

  @span("driver.wait", BaseDriver.spanAttrs)
  @stateful
  async wait(seconds: number): Promise<void> {
    const clampedSeconds = Math.max(1, Math.min(30, seconds));
    logger.debug("Waiting for {clampedSeconds} seconds", {
      seconds: clampedSeconds,
    });

    await new Promise((resolve) => setTimeout(resolve, clampedSeconds * 1000));
  }

  @span("driver.wait_for_selector", BaseDriver.spanAttrs)
  @stateful
  async waitForSelector(selector: string, timeout?: number): Promise<void> {
    const timeoutMs = (timeout ?? 10) * 1000;
    logger.debug(
      "Waiting for selector {selector} with timeout {timeoutMs} ms",
      { selector, timeoutMs },
    );

    await this.page.waitForSelector(selector, {
      state: "visible",
      timeout: timeoutMs,
    });
  }

  @stateful
  async grantPermissions(permissions: string[]): Promise<void> {
    await this.page.context().grantPermissions(permissions);
  }

  async checkNavigationPolicy(url?: string): Promise<void> {
    const currentUrl = url ?? (await this.url());
    this.navigationPolicy.check(currentUrl);
  }

  @span("driver.wait_for_page_to_load", BaseDriver.spanAttrs)
  private async waitForPageToLoad(): Promise<void> {
    return retry(RETRY_OPTIONS, async () => {
      await this.cdpReady;
      logger.debug("Waiting for page to finish loading:");
      const result = await waitForPageStability(this.networkMonitor, () =>
        this.page.evaluate(WAITER_SNAPSHOT_SCRIPT),
      );
      if (!result.loaded) {
        logger.debug(
          `  <- Timed out waiting for page to load; pending requests: ${result.pending.join(", ")}`,
        );
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

    await this.cdpReady;
    const context = this.page.context();
    const newTabAction: NewTabAction = { announced: false, pages: [] };
    this.newTabAction = newTabAction;
    try {
      await action();
      if (!newTabAction.pages.length)
        await new Promise((resolve) => setTimeout(resolve, NEW_TAB_DELAY));

      let newPage = newTabAction.pages.findLast((page) => !page.isClosed());
      if (!newPage && newTabAction.announced) {
        newPage = await this.waitForAnnouncedTab(context, newTabAction);
      }
      if (!newPage) return;

      logger.debug(`Auto-switching to new tab: ${newPage.url()}`);
      await this.activatePage(newPage);
    } finally {
      if (this.newTabAction === newTabAction) this.newTabAction = undefined;
    }
  }

  private async waitForAnnouncedTab(
    context: BrowserContext,
    action: NewTabAction,
  ): Promise<Page | undefined> {
    const deadline = Date.now() + this.newTabTimeout;
    while (Date.now() < deadline) {
      const page = await context
        .waitForEvent("page", {
          timeout: Math.max(1, Math.min(100, deadline - Date.now())),
        })
        .catch(() => undefined);
      if (page) return page;
      const captured = action.pages.findLast(
        (candidate) => !candidate.isClosed(),
      );
      if (captured) return captured;
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
    _playwrightFrame: Frame,
  ): Promise<CDPNode[]> {
    let nodes: CDPNode[];
    try {
      const response = (await this.client.send("Accessibility.getFullAXTree", {
        frameId,
      })) as { nodes: CDPNode[] };
      nodes = response.nodes || [];
      logger.debug(
        `  -> Frame ${frameId.slice(0, 20)}...: ${nodes.length} nodes`,
      );
    } catch (error) {
      logger.debug(
        `  -> Frame ${frameId.slice(0, 20)}...: failed (${error instanceof Error ? error.message : String(error)})`,
      );
      return [];
    }

    return nodes;
  }

  private async getOopifNodes(
    frameId: string,
    playwrightFrame: Frame,
  ): Promise<CDPNode[]> {
    let frameSession: CDPSession | undefined;
    try {
      // OOPIFs run in a separate renderer process — open a per-frame CDP session
      // scoped to that target, then call getFullAXTree without a frameId parameter.
      frameSession = await this.page.context().newCDPSession(playwrightFrame);
      const response = (await frameSession.send(
        "Accessibility.getFullAXTree",
        {},
      )) as { nodes: CDPNode[] };
      const nodes = response.nodes || [];
      logger.debug(
        `  -> OOPIF ${frameId.slice(0, 20)}...: got ${nodes.length} nodes`,
      );

      return nodes;
    } catch (oopifError) {
      logger.debug(
        `  -> OOPIF ${frameId.slice(0, 20)}...: failed (${oopifError instanceof Error ? oopifError.message : String(oopifError)})`,
      );
      return [];
    } finally {
      await frameSession?.detach().catch(() => undefined);
    }
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

    const frame = (accessibilityElement.frame ??
      this.page.mainFrame()) as Frame;
    const isOopif = frame !== this.page.mainFrame() && this.isOopifFrame(frame);
    let session: CDPSession;
    try {
      session = isOopif
        ? await this.page.context().newCDPSession(frame)
        : this.client;
    } catch (error) {
      throw new TreeDevDrillError("resolve", error, backendNodeId);
    }

    const attribute = "data-alumnium-drill";
    let nodeId: number | undefined;
    let set = false;
    let failure: unknown;
    try {
      try {
        await session.send("DOM.enable");
        await session.send("DOM.getFlattenedDocument");
        const response = await session.send(
          "DOM.pushNodesByBackendIdsToFrontend",
          { backendNodeIds: [backendNodeId] },
        );
        nodeId = response.nodeIds[0];
        if (!nodeId) {
          throw new Error(
            `No frontend node for backend node ID ${backendNodeId}`,
          );
        }
      } catch (error) {
        throw new TreeDevDrillError("resolve", error, backendNodeId);
      }

      try {
        await session.send("DOM.setAttributeValue", {
          nodeId,
          name: attribute,
          value: crypto.randomUUID(),
        });
        set = true;
      } catch (error) {
        throw new TreeDevDrillError("probe", error, backendNodeId);
      }
    } catch (error) {
      failure = error;
    } finally {
      if (set && nodeId) {
        try {
          await session.send("DOM.removeAttribute", {
            nodeId,
            name: attribute,
          });
        } catch (error) {
          failure ??= new TreeDevDrillError("probe", error, backendNodeId);
        }
      }
      if (isOopif) {
        try {
          await session.detach();
        } catch (error) {
          failure ??= new TreeDevDrillError("resolve", error, backendNodeId);
        }
      }
    }

    if (failure) throw failure;
    return backendNodeId;
  }

  //#endregion
}
