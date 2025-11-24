import { Key as SeleniumKey } from "selenium-webdriver";
import type { Browser, ChainablePromiseElement } from "webdriverio";
import { BaseAccessibilityTree } from "../accessibility/BaseAccessibilityTree.js";
import { UIAutomator2AccessibilityTree } from "../accessibility/UIAutomator2AccessibilityTree.js";
import { XCUITestAccessibilityTree } from "../accessibility/XCUITestAccessibilityTree.js";
import { BaseDriver } from "./BaseDriver.js";
import { Key } from "./keys.js";

export class AppiumDriver extends BaseDriver {
  private driver: Browser;
  public platform: "xcuitest" | "uiautomator2";
  public supportedTools: Set<string> = new Set([
    "ClickTool",
    "DragAndDropTool",
    "NavigateToUrlTool",
    "PressKeyTool",
    "SelectTool",
    "TypeTool",
  ]);
  public autoswitchContexts: boolean = true;
  public delay: number = 0;
  public doubleFetchPageSource: boolean = false;
  public hideKeyboardAfterTyping: boolean = false;

  constructor(driver: Browser) {
    super();
    this.driver = driver;
    if (
      this.driver.capabilities["appium:automationName"]?.toLowerCase() ===
      "uiautomator2"
    ) {
      this.platform = "uiautomator2";
    } else {
      this.platform = "xcuitest";
    }
  }

  async getAccessibilityTree(): Promise<BaseAccessibilityTree> {
    await this.ensureNativeAppContext();
    if (this.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delay * 1000));
    }
    // Hacky workaround for cloud providers reporting stale page source.
    // Intentionally fetch and discard the page source to refresh internal state.
    if (this.doubleFetchPageSource) {
      await this.driver.getPageSource();
    }

    const xmlString = await this.driver.getPageSource();
    if (this.driver.capabilities["appium:automationName"] === "uiautomator2") {
      return new UIAutomator2AccessibilityTree(xmlString);
    } else {
      return new XCUITestAccessibilityTree(xmlString);
    }
  }

  async click(id: number): Promise<void> {
    await this.ensureNativeAppContext();
    const element = await this.findElement(id);
    await element.click();
  }

  async dragAndDrop(fromId: number, toId: number): Promise<void> {
    await this.ensureNativeAppContext();
    const fromElement = await this.findElement(fromId);
    const toElement = await this.findElement(toId);

    // WebdriverIO provides dragAndDrop method on elements
    await fromElement.dragAndDrop(toElement);
  }

  async pressKey(key: Key): Promise<void> {
    await this.ensureNativeAppContext();
    const keyMap: Record<Key, string> = {
      [Key.BACKSPACE]: SeleniumKey.BACK_SPACE,
      [Key.ENTER]: SeleniumKey.ENTER,
      [Key.ESCAPE]: SeleniumKey.ESCAPE,
      [Key.TAB]: SeleniumKey.TAB,
    };

    // Simulate ActionChains behavior
    await this.driver.performActions([
      {
        type: "key",
        id: "keyboard",
        actions: [
          { type: "keyDown", value: keyMap[key] },
          { type: "keyUp", value: keyMap[key] },
        ],
      },
    ]);
  }

  async back(): Promise<void> {
    await this.driver.back();
  }

  async visit(url: string): Promise<void> {
    await this.driver.url(url);
  }

  async quit(): Promise<void> {
    // WebdriverIO handles session termination automatically.
  }

  async screenshot(): Promise<string> {
    return await this.driver.takeScreenshot();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async select(_id: number, _option: string): Promise<void> {
    // TODO: Implement select functionality and the tool
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async swipe(_id: number): Promise<void> {
    // TODO: Implement swipe functionality and the tool
  }

  async title(): Promise<string> {
    await this.ensureWebviewContext();
    try {
      return await this.driver.getTitle();
    } catch {
      return "";
    }
  }

  async type(id: number, text: string): Promise<void> {
    await this.ensureNativeAppContext();
    const element = await this.findElement(id);
    await element.clearValue();
    await element.setValue(text);
    if (this.hideKeyboardAfterTyping) {
      if (this.platform === "uiautomator2") {
        await this.driver.hideKeyboard();
      } else {
        const location = await element.getLocation();
        await this.driver.performActions([
          {
            type: "pointer",
            id: "finger1",
            parameters: { pointerType: "touch" },
            actions: [
              {
                type: "pointerMove",
                duration: 0,
                x: location.x,
                y: location.y - 20,
              },
              { type: "pointerDown", button: 0 },
              { type: "pointerUp", button: 0 },
            ],
          },
        ]);
      }
    }
  }

  async url(): Promise<string> {
    await this.ensureWebviewContext();
    try {
      return await this.driver.getUrl();
    } catch {
      return "";
    }
  }

  async findElement(id: number): Promise<ChainablePromiseElement> {
    const tree = await this.getAccessibilityTree();
    const element = tree.elementById(id);

    if (this.platform === "xcuitest") {
      // Use iOS Predicate locators for XCUITest
      let predicate = `type == "${element.type}"`;

      const props: Record<string, string> = {};
      if (element.name) props["name"] = element.name;
      if (element.value) props["value"] = element.value;
      if (element.label) props["label"] = element.label;

      if (Object.keys(props).length > 0) {
        const conditions = Object.entries(props).map(
          ([k, v]) => `${k} == "${v}"`
        );
        const propsStr = conditions.join(" AND ");
        predicate += ` AND ${propsStr}`;
      }

      console.debug(`Finding element by predicate: ${predicate}`);
      const foundElement = this.driver.$(`-ios predicate string:${predicate}`);
      return foundElement;
    } else {
      // Use XPath for UIAutomator2
      let xpath = `//${element.type}`;

      const props: Record<string, string> = {};
      if (element.androidResourceId)
        props["resource-id"] = element.androidResourceId;
      if (element.androidText) props["text"] = element.androidText;
      if (element.androidContentDesc)
        props["content-desc"] = element.androidContentDesc;
      if (element.androidBounds) props["bounds"] = element.androidBounds;

      if (Object.keys(props).length > 0) {
        const conditions = Object.entries(props).map(
          ([k, v]) => `@${k}="${v}"`
        );
        xpath += `[${conditions.join(" and ")}]`;
      }

      return this.driver.$(xpath);
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await, @typescript-eslint/no-unused-vars
  async hover(_id: number): Promise<void> {
    // Hover is not typically supported in mobile contexts
    throw new Error("Hover is not supported by AppiumDriver");
  }

  private async ensureNativeAppContext(): Promise<void> {
    if (!this.autoswitchContexts) {
      return;
    }

    const currentContext = (await this.driver.getAppiumContext()) as string;
    if (currentContext !== "NATIVE_APP") {
      await this.driver.switchContext("NATIVE_APP");
    }
  }

  private async ensureWebviewContext(): Promise<void> {
    if (!this.autoswitchContexts) {
      return;
    }

    const currentContext = (await this.driver.getAppiumContext()) as string;
    if (!currentContext.includes("WEBVIEW")) {
      const contexts = (await this.driver.getAppiumContexts()) as string[];
      for (const context of contexts) {
        if (context.includes("WEBVIEW")) {
          await this.driver.switchContext(context);
          return;
        }
      }
    }
  }
}
