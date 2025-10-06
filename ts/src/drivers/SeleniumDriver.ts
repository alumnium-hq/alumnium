/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  WebDriver,
  WebElement,
  By,
  Key as SeleniumKey,
} from "selenium-webdriver";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { BaseDriver } from "./BaseDriver.js";
import { RawAccessibilityTree } from "../accessibility/RawAccessibilityTree.js";
import { Key } from "./keys.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class SeleniumDriver extends BaseDriver {
  private static WAITER_SCRIPT = fs.readFileSync(
    path.join(__dirname, "scripts/waiter.js"),
    "utf8"
  );
  private static WAIT_FOR_SCRIPT = fs.readFileSync(
    path.join(__dirname, "scripts/waitFor.js"),
    "utf8"
  );

  private driver: WebDriver;
  public supportedTools: Set<string> = new Set([
    "ClickTool",
    "DragAndDropTool",
    "HoverTool",
    "PressKeyTool",
    "SelectTool",
    "TypeTool",
  ]);

  constructor(driver: WebDriver) {
    super();
    this.driver = driver;
  }

  get accessibilityTree(): RawAccessibilityTree {
    throw new Error(
      "accessibilityTree getter is synchronous, use getAccessibilityTree() method instead"
    );
  }

  async getAccessibilityTree(): Promise<RawAccessibilityTree> {
    await this.waitForPageToLoad();

    const rawData = await this.executeCdpCommand(
      "Accessibility.getFullAXTree",
      {}
    );
    return new RawAccessibilityTree(rawData, "chromium");
  }

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

  quit(): void {
    void this.driver.quit();
  }

  async back(): Promise<void> {
    await this.driver.navigate().back();
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
    // Use CDP to find element by backend node ID
    await this.executeCdpCommand("DOM.enable", {});
    await this.executeCdpCommand("DOM.getFlattenedDocument", {});

    const nodeIds = await this.executeCdpCommand(
      "DOM.pushNodesByBackendIdsToFrontend",
      {
        backendNodeIds: [id],
      }
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const nodeId = nodeIds.nodeIds[0];

    // Set temporary attribute to locate element

    await this.executeCdpCommand("DOM.setAttributeValue", {
      nodeId,
      name: "data-alumnium-id",
      value: String(id),
    });

    const element = await this.driver.findElement(
      By.css(`[data-alumnium-id='${id}']`)
    );

    // Remove temporary attribute

    await this.executeCdpCommand("DOM.removeAttribute", {
      nodeId,
      name: "data-alumnium-id",
    });

    return element;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async executeCdpCommand(cmd: string, params: any): Promise<any> {
    // Cast driver to any to access CDP methods
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const driver = this.driver as any;

    // Try sendAndGetDevToolsCommand first (ChromeDriver - selenium 4.x) - returns result
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (typeof driver.sendAndGetDevToolsCommand === "function") {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      return await driver.sendAndGetDevToolsCommand(cmd, params);
    }

    // Try executeCdpCmd (Python-style method name)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (typeof driver.executeCdpCmd === "function") {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      return await driver.executeCdpCmd(cmd, params);
    }

    // Try sendDevToolsCommand (doesn't return result, but fallback)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (typeof driver.sendDevToolsCommand === "function") {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      return await driver.sendDevToolsCommand(cmd, params);
    }

    throw new Error(
      `CDP commands are not supported by this driver. ` +
        `Available methods: ${Object.getOwnPropertyNames(
          Object.getPrototypeOf(driver)
        ).join(", ")}`
    );
  }

  private async waitForPageToLoad(): Promise<void> {
    try {
      await this.driver.executeScript(SeleniumDriver.WAITER_SCRIPT);
      const error: unknown = await this.driver.executeAsyncScript(
        SeleniumDriver.WAIT_FOR_SCRIPT
      );
      if (error) {
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        console.warn(`Failed to wait for page to load: ${String(error)}`);
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
          console.warn(`Failed to wait for page to load: ${String(error)}`);
        }
      } catch (retryError: unknown) {
        console.warn(
          `Failed to wait for page to load after retry: ${String(retryError)}`
        );
      }
    }
  }
}
