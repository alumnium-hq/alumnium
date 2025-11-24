import { readFileSync } from "fs";
import { dirname, join } from "path";
import { CDPSession, Locator, Page } from "playwright";
import { fileURLToPath } from "url";
import { BaseAccessibilityTree } from "../accessibility/BaseAccessibilityTree.js";
import { ChromiumAccessibilityTree } from "../accessibility/ChromiumAccessibilityTree.js";
import { getLogger } from "../utils/logger.js";
import { Retry } from "../utils/retry.js";
import { BaseDriver } from "./BaseDriver.js";
import { Key } from "./keys.js";

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
    "SelectTool",
    "TypeTool",
  ]);

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
    const rawData = await this.client.send("Accessibility.getFullAXTree");
    return new ChromiumAccessibilityTree(rawData);
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
    } else {
      await element.click();
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

    await this.page.keyboard.press(keyMap[key]);
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

  @Retry({
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

  @Retry({
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
    await element.fill(text);
  }

  @Retry({
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
    return this.page.locator(`css=[data-alumnium-id='${backendNodeId}']`);
  }

  @Retry({
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
}
