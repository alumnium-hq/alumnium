import { readFileSync } from "fs";
import { dirname, join } from "path";
import { CDPSession, Frame, Locator, Page } from "playwright";
import { fileURLToPath } from "url";
import { BaseAccessibilityTree } from "../accessibility/BaseAccessibilityTree.js";
import { ChromiumAccessibilityTree } from "../accessibility/ChromiumAccessibilityTree.js";
import { getLogger } from "../utils/logger.js";
import { retry } from "../utils/retry.js";
import { BaseDriver } from "./BaseDriver.js";
import { Key } from "./keys.js";

interface CDPNode {
  nodeId: string;
  role?: { value?: string };
  name?: { value?: string };
  childIds?: string[];
  _playwright_node?: boolean;
  _locator_info?: Record<string, unknown>;
  _frame_url?: string;
  _frame?: object;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logger = getLogger(["driver", "playwright"]);

export class PlaywrightDriver extends BaseDriver {
  private static CONTEXT_WAS_DESTROYED_ERROR =
    "Execution context was destroyed";

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
  public supportedTools: Set<string> = new Set([
    "ClickTool",
    "DragAndDropTool",
    "HoverTool",
    "NavigateToUrlTool",
    "PressKeyTool",
    "ScrollTool",
    "SelectTool",
    "TypeTool",
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
  }

  async getAccessibilityTree(): Promise<BaseAccessibilityTree> {
    await this.waitForPageToLoad();

    // Use Playwright's native frame detection
    const playwrightFrames = this.page.frames();
    logger.debug(`Playwright detected ${playwrightFrames.length} frames`);

    // Get CDP frame tree for mapping
    const cdpFrameTree = await this.client.send("Page.getFrameTree");

    // Build combined accessibility tree from all frames
    const allNodes: CDPNode[] = [];

    for (const frame of playwrightFrames) {
      const frameUrl = frame.url();
      logger.debug(`Processing frame: ${frameUrl}`);

      try {
        const treeResponse = await this.getAccessibilityTreeForFrame(
          frame,
          cdpFrameTree
        );
        const nodeCount = treeResponse.nodes?.length || 0;
        logger.debug(`  -> Got ${nodeCount} nodes`);

        // Tag all nodes with their Playwright frame reference
        for (const node of treeResponse.nodes || []) {
          node._frame = frame;
          allNodes.push(node);
        }
      } catch (error) {
        logger.error(`  -> Failed to get accessibility tree: ${error}`);
      }
    }

    return new ChromiumAccessibilityTree({ nodes: allNodes });
  }

  async click(id: number): Promise<void> {
    const element = await this.findElement(id);
    const tagName = await element.evaluate(
      (el: { tagName: string }) => el.tagName
    );

    // Llama often attempts to click options, not select them.
    if (tagName.toLowerCase() === "option") {
      const option = await element.textContent();
      await element
        .locator("xpath=.//parent::select")
        .selectOption(option || "");
      return;
    }

    await this.autoswitchToNewTab(() => element.click({ force: true }));
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
      error.message.includes(PlaywrightDriver.CONTEXT_WAS_DESTROYED_ERROR),
  })
  async screenshot(): Promise<string> {
    const buffer = await this.page.screenshot();
    return buffer.toString("base64");
  }

  async select(id: number, option: string): Promise<void> {
    const element = await this.findElement(id);
    const tagName = await element.evaluate(
      (el: { tagName: string }) => el.tagName
    );

    // Anthropic chooses to select using option ID, not select ID
    if (tagName.toLowerCase() === "option") {
      await element.locator("xpath=.//parent::select").selectOption(option);
    } else {
      await element.selectOption(option);
    }
  }

  @retry({
    maxAttempts: 2,
    backOff: 500,
    doRetry: (error: Error) =>
      error.message.includes(PlaywrightDriver.CONTEXT_WAS_DESTROYED_ERROR),
  })
  async title(): Promise<string> {
    return await this.page.title();
  }

  async type(id: number, text: string): Promise<void> {
    const element = await this.findElement(id);
    const inputType = await element.getAttribute("type");
    text = this.normalizeInputText(inputType, text);
    if (inputType === "file") {
      await element.setInputFiles(text);
    } else {
      await element.fill(text);
    }
  }

  @retry({
    maxAttempts: 2,
    backOff: 500,
    doRetry: (error: Error) =>
      error.message.includes(PlaywrightDriver.CONTEXT_WAS_DESTROYED_ERROR),
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
      return this.findElementByLocatorInfo(frame, accessibilityElement.locatorInfo);
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
      error.message.includes(PlaywrightDriver.CONTEXT_WAS_DESTROYED_ERROR),
  })
  private async waitForPageToLoad(): Promise<void> {
    logger.debug("Waiting for page to finish loading:");
    await this.page.evaluate(
      `function() { ${PlaywrightDriver.WAITER_SCRIPT} }`
    );
    const error: unknown = await this.page.evaluate(
      PlaywrightDriver.WAIT_FOR_SCRIPT
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

  private async getAccessibilityTreeForFrame(
    frame: Frame,
    cdpFrameTree: any
  ): Promise<{ nodes: CDPNode[] }> {
    // Find matching CDP frame by URL
    const cdpFrameId = this.findCdpFrameIdByUrl(cdpFrameTree, frame.url());

    if (cdpFrameId) {
      // Use CDP to get accessibility tree with frameId
      return await this.client.send("Accessibility.getFullAXTree", {
        frameId: cdpFrameId,
      });
    } else {
      // Frame not visible to CDP - query frame content directly using Playwright
      logger.info(
        `Frame ${frame.url()} not in CDP tree, querying interactive elements`
      );

      const nodes: CDPNode[] = [];
      let nodeId = -1;

      try {
        // Query for interactive elements inside the frame
        const interactiveSelectors: Array<[string, string]> = [
          ["button", "button"],
          ["a", "link"],
          ["[role='button']", "button"],
          ["[role='link']", "link"],
          ["input[type='submit']", "button"],
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
                  };
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
          `  -> Created ${nodes.length} synthetic nodes for ${frame.url().slice(0, 60)}`
        );
      } catch (error) {
        logger.error(`  -> Failed to query frame content: ${error}`);
      }

      // Always add a frame container node
      const frameNode: CDPNode = {
        nodeId: String(nodeId),
        role: { value: "Iframe" },
        name: { value: `Cross-origin iframe: ${frame.url().slice(0, 80)}` },
        _playwright_node: true,
        _frame_url: frame.url(),
        childIds:
          nodes.length > 0
            ? Array.from({ length: nodes.length }, (_, i) => String(-1 - i))
            : [],
      };
      nodes.push(frameNode);

      return { nodes };
    }
  }

  private findCdpFrameIdByUrl(
    cdpFrameTree: any,
    targetUrl: string
  ): string | null {
    const searchFrame = (frameInfo: any): string | null => {
      const frame = frameInfo.frame;
      if (frame.url === targetUrl) {
        return frame.id;
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
    locatorInfo: Record<string, any>
  ): Locator {
    // Handle synthetic frame nodes
    if (locatorInfo._synthetic_frame) {
      const frameUrl = locatorInfo._frame_url || "";
      logger.debug(
        `Synthetic frame node clicked, returning frame locator for: ${frameUrl.slice(0, 80)}`
      );
      return frame.locator("body");
    }

    // Handle selector+nth-based locators (from queried frame content)
    if (locatorInfo.selector && typeof locatorInfo.nth === "number") {
      const selector = locatorInfo.selector as string;
      const nth = locatorInfo.nth as number;
      logger.debug(`Finding element by selector: ${selector} (nth=${nth})`);
      return frame.locator(selector).nth(nth);
    }

    const role = locatorInfo.role;
    const name = locatorInfo.name;

    logger.debug(`Finding element by locator info: role=${role}, name=${name}`);

    // Use Playwright's getByRole for accessibility-based element finding
    if (role && name) {
      return frame.getByRole(role, { name });
    } else if (role) {
      return frame.getByRole(role);
    } else if (name) {
      return frame.getByText(name);
    } else {
      throw new Error(
        `Cannot find element: no role or name in locator_info: ${JSON.stringify(locatorInfo)}`
      );
    }
  }
}
