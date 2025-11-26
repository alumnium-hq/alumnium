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
import { getLogger } from "../utils/logger.js";
import { BaseDriver } from "./BaseDriver.js";
import { Key } from "./keys.js";

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

  constructor(driver: WebDriver) {
    super();
    this.driver = driver as ChromiumWebDriver;
  }

  async getAccessibilityTree(): Promise<BaseAccessibilityTree> {
    await this.waitForPageToLoad();

    const rawData = await this.executeCdpCommand(
      "Accessibility.getFullAXTree",
      {}
    );
    return new ChromiumAccessibilityTree(rawData);
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

  async url(): Promise<string> {
    return await this.driver.getCurrentUrl();
  }

  async findElement(id: number): Promise<WebElement> {
    const tree = await this.getAccessibilityTree();
    const accessibilityElement = tree.elementById(id);
    const backendNodeId = accessibilityElement.backendNodeId!;

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

    return element;
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
