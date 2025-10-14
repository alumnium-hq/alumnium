/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Key as SeleniumKey } from "selenium-webdriver";
import type { Browser, ChainablePromiseElement } from "webdriverio";
import { RawAccessibilityTree } from "../accessibility/RawAccessibilityTree.js";
import { BaseDriver } from "./BaseDriver.js";
import { Key } from "./keys.js";

export class AppiumDriver extends BaseDriver {
  private driver: Browser;
  public platform: string = "xcuitest"; // TODO: uiautomator2
  public supportedTools: Set<string> = new Set([
    "ClickTool",
    "DragAndDropTool",
    "PressKeyTool",
    "SelectTool",
    "TypeTool",
  ]);
  public autoswitchToWebview: boolean = true;
  public delay: number = 0;
  public hideKeyboardAfterTyping: boolean = false;

  constructor(driver: Browser) {
    super();
    this.driver = driver;
  }

  get accessibilityTree(): RawAccessibilityTree {
    throw new Error(
      "accessibilityTree getter is synchronous, use getAccessibilityTree() method instead"
    );
  }

  async getAccessibilityTree(): Promise<RawAccessibilityTree> {
    if (this.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delay));
    }
    const rawData = await this.driver.getPageSource();
    const automationType =
      (this.driver.capabilities as any).automationName === "uiautomator2"
        ? "uiautomator2"
        : "xcuitest";
    return new RawAccessibilityTree(rawData, automationType);
  }

  async click(id: number): Promise<void> {
    const element = await this.findElement(id);
    await element.click();
  }

  async dragAndDrop(fromId: number, toId: number): Promise<void> {
    const fromElement = await this.findElement(fromId);
    const toElement = await this.findElement(toId);

    // WebdriverIO provides dragAndDrop method on elements
    await fromElement.dragAndDrop(toElement);
  }

  async pressKey(key: Key): Promise<void> {
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

  async quit(): Promise<void> {
    await this.driver.deleteSession();
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
    const context = await this.webviewContext();
    if (context) {
      try {
        return await this.driver.getTitle();
      } finally {
        await this.restoreContext(context.original);
      }
    }
    return "";
  }

  async type(id: number, text: string): Promise<void> {
    const element = await this.findElement(id);
    await element.clearValue();
    await element.setValue(text);
    if (this.hideKeyboardAfterTyping) {
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

  async url(): Promise<string> {
    const context = await this.webviewContext();
    if (context) {
      try {
        return await this.driver.getUrl();
      } finally {
        await this.restoreContext(context.original);
      }
    }
    return "";
  }

  async findElement(id: number): Promise<ChainablePromiseElement> {
    const tree = await this.getAccessibilityTree();
    const element = this.getElementFromTree(tree, id);

    if (!element) {
      throw new Error(`Element with id ${id} not found in accessibility tree`);
    }

    let xpath = `//${element.type}`;

    const props: Record<string, string> = {};
    if (element.name) props["name"] = element.name;
    if (element.value) props["value"] = element.value;
    if (element.label) props["label"] = element.label;
    if (element.androidresourceid)
      props["resource-id"] = element.androidresourceid;
    if (element.androidtext) props["text"] = element.androidtext;
    if (element.androidcontentdesc)
      props["content-desc"] = element.androidcontentdesc;
    if (element.androidbounds) props["bounds"] = element.androidbounds;

    if (Object.keys(props).length > 0) {
      const conditions = Object.entries(props).map(([k, v]) => `@${k}="${v}"`);
      xpath += `[${conditions.join(" and ")}]`;
    }

    return this.driver.$(xpath);
  }

  private getElementFromTree(tree: RawAccessibilityTree, id: number): any {
    // Parse XML and find element by ID
    // This is a simplified implementation - you may need to install an XML parser
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const DOMParser = require("xmldom").DOMParser;
    const doc = new DOMParser().parseFromString(tree.rawData, "text/xml");

    let currentId = 0;
    const findElement = (node: any): any => {
      if (node.nodeType === 1) {
        // Element node
        currentId++;
        if (currentId === id) {
          const element: any = {
            type: node.tagName,
          };

          // Extract attributes
          if (node.getAttribute("name"))
            element.name = node.getAttribute("name");
          if (node.getAttribute("value"))
            element.value = node.getAttribute("value");
          if (node.getAttribute("label"))
            element.label = node.getAttribute("label");
          if (node.getAttribute("resource-id"))
            element.androidresourceid = node.getAttribute("resource-id");
          if (node.getAttribute("text"))
            element.androidtext = node.getAttribute("text");
          if (node.getAttribute("content-desc"))
            element.androidcontentdesc = node.getAttribute("content-desc");
          if (node.getAttribute("bounds"))
            element.androidbounds = node.getAttribute("bounds");

          return element;
        }

        // Check children
        for (let i = 0; i < node.childNodes.length; i++) {
          const result = findElement(node.childNodes[i]);
          if (result) return result;
        }
      }
      return null;
    };

    return findElement(doc.documentElement);
  }

  // eslint-disable-next-line @typescript-eslint/require-await, @typescript-eslint/no-unused-vars
  async hover(_id: number): Promise<void> {
    // Hover is not typically supported in mobile contexts
    throw new Error("Hover is not supported by AppiumDriver");
  }

  private async webviewContext(): Promise<{
    original: string;
    webview: string;
  } | null> {
    if (!this.autoswitchToWebview) {
      return null;
    }

    const currentContext = await this.driver.getContext();
    const contexts = await this.driver.getContexts();
    for (const context of contexts) {
      const contextStr =
        typeof context === "string" ? context : (context as any).id;
      if (contextStr.includes("WEBVIEW")) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        await this.driver.switchContext(contextStr);
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        return { original: String(currentContext), webview: contextStr };
      }
    }

    return null;
  }

  private async restoreContext(context: string): Promise<void> {
    await this.driver.switchContext(context);
  }
}
