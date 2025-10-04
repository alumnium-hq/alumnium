import { WebDriver, WebElement, By, Key as SeleniumKey } from 'selenium-webdriver';
import * as fs from 'fs';
import * as path from 'path';
import { BaseDriver } from './BaseDriver';
import { ChromiumAccessibilityTree } from '../accessibility/ChromiumAccessibilityTree';
import { Key } from './keys';

export class SeleniumDriver extends BaseDriver {
  private static WAITER_SCRIPT = fs.readFileSync(
    path.join(__dirname, 'scripts/waiter.js'),
    'utf8'
  );
  private static WAIT_FOR_SCRIPT = fs.readFileSync(
    path.join(__dirname, 'scripts/waitFor.js'),
    'utf8'
  );

  private driver: WebDriver;
  public supportedTools: Set<string> = new Set([
    'ClickTool',
    'DragAndDropTool',
    'HoverTool',
    'PressKeyTool',
    'SelectTool',
    'TypeTool',
  ]);

  constructor(driver: WebDriver) {
    super();
    this.driver = driver;
  }

  get accessibilityTree(): ChromiumAccessibilityTree {
    this.waitForPageToLoad();
    const axTree = this.executeCdpCommand('Accessibility.getFullAXTree', {});
    return new ChromiumAccessibilityTree(axTree);
  }

  click(id: number): void {
    this.findElement(id).click();
  }

  async dragAndDrop(fromId: number, toId: number): Promise<void> {
    const actions = this.driver.actions({ async: true });
    await actions
      .dragAndDrop(this.findElement(fromId), this.findElement(toId))
      .perform();
  }

  async hover(id: number): Promise<void> {
    const actions = this.driver.actions({ async: true });
    await actions.move({ origin: this.findElement(id) }).perform();
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
    this.driver.quit();
  }

  back(): void {
    this.driver.navigate().back();
  }

  async screenshot(): Promise<string> {
    return await this.driver.takeScreenshot();
  }

  async select(id: number, option: string): Promise<void> {
    const element = this.findElement(id);
    const tagName = await element.getTagName();

    // Handle case where option element is selected instead of select element
    let selectElement = element;
    if (tagName === 'option') {
      selectElement = await element.findElement(By.xpath('.//parent::select'));
    }

    const options = await selectElement.findElements(By.tagName('option'));
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
    const element = this.findElement(id);
    await element.clear();
    await element.sendKeys(text);
  }

  async url(): Promise<string> {
    return await this.driver.getCurrentUrl();
  }

  findElement(id: number): WebElement {
    // Use CDP to find element by backend node ID
    this.executeCdpCommand('DOM.enable', {});
    this.executeCdpCommand('DOM.getFlattenedDocument', {});

    const nodeIds = this.executeCdpCommand('DOM.pushNodesByBackendIdsToFrontend', {
      backendNodeIds: [id],
    });
    const nodeId = nodeIds.nodeIds[0];

    // Set temporary attribute to locate element
    this.executeCdpCommand('DOM.setAttributeValue', {
      nodeId,
      name: 'data-alumnium-id',
      value: String(id),
    });

    const element = this.driver.findElement(By.css(`[data-alumnium-id='${id}']`));

    // Remove temporary attribute
    this.executeCdpCommand('DOM.removeAttribute', {
      nodeId,
      name: 'data-alumnium-id',
    });

    return element;
  }

  private executeCdpCommand(cmd: string, params: any): any {
    // Cast driver to any to access executeCdpCmd which may not be in types
    const driver = this.driver as any;

    if (typeof driver.sendDevToolsCommand === 'function') {
      return driver.sendDevToolsCommand(cmd, params);
    } else if (typeof driver.executeCdpCmd === 'function') {
      return driver.executeCdpCmd(cmd, params);
    } else {
      // Fallback: use execute with CDP command
      return driver.execute('executeCdpCommand', { cmd, params }).then((result: any) => result.value);
    }
  }

  private waitForPageToLoad(): void {
    try {
      this.driver.executeScript(SeleniumDriver.WAITER_SCRIPT);
      const error = this.driver.executeAsyncScript(SeleniumDriver.WAIT_FOR_SCRIPT);
      if (error) {
        console.warn(`Failed to wait for page to load: ${error}`);
      }
    } catch (e) {
      // Retry once on failure
      try {
        this.driver.executeScript(SeleniumDriver.WAITER_SCRIPT);
        const error = this.driver.executeAsyncScript(SeleniumDriver.WAIT_FOR_SCRIPT);
        if (error) {
          console.warn(`Failed to wait for page to load: ${error}`);
        }
      } catch (retryError) {
        console.warn(`Failed to wait for page to load after retry: ${retryError}`);
      }
    }
  }
}
