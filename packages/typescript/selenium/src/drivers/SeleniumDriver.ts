import { always } from "alwaysly";
import { Key as SeleniumKey, WebDriver, WebElement } from "selenium-webdriver";
import {
  ElementNotInteractableError,
  MoveTargetOutOfBoundsError,
  NoSuchSessionError,
} from "selenium-webdriver/lib/error.js";
import {
  AppId,
  BaseDriver,
  ClickTool,
  DragAndDropTool,
  Env,
  HoverTool,
  Keys,
  PressKeyTool,
  Slider,
  Telemetry,
  type ToolClass,
  TypeTool,
  UploadTool,
  WAITER_SNAPSHOT_SCRIPT,
  waiterScriptSource,
  type WaiterSnapshot,
  waitForPageStability,
} from "@alumnium/core/internal";

const { tracer, logger } = Telemetry.get(import.meta.url);
const { span } = tracer.dec();
const stateful = BaseDriver.stateful;

const WAITER_SCRIPT = waiterScriptSource;

/**
 * WebDriver actions shared by the browser-specific Selenium drivers, which
 * differ in how they build accessibility trees and locate elements.
 */
export abstract class SeleniumDriver extends BaseDriver<WebElement> {
  protected driver: WebDriver;
  kind = "selenium" as const;
  abstract override platform: "chromium" | "firefox";
  autoswitchToNewTab = true;
  protected pageScriptsReady: Promise<void>;
  public fullPageScreenshot = Env.ALUMNIUM_FULL_PAGE_SCREENSHOT;
  public supportedTools: Set<ToolClass> = new Set([
    ClickTool,
    DragAndDropTool,
    HoverTool,
    PressKeyTool,
    TypeTool,
    UploadTool,
  ]);

  constructor(driver: WebDriver) {
    super();
    this.driver = driver;
    this.pageScriptsReady = Promise.resolve().then(() =>
      this.initPageScripts(),
    );
  }

  protected abstract initPageScripts(): Promise<void>;

  protected closeConnections(): void {}

  @span("driver.click", BaseDriver.spanAttrs)
  @stateful
  async click(id: number): Promise<void> {
    await this.#autoswitchToNewTabAction(async () => {
      const element = await this.findElement(id);
      await this.#scrollElementIntoCenter(element);
      try {
        const actions = this.driver.actions({ async: true });
        await actions.move({ origin: element }).click().perform();
      } catch (error) {
        if (
          error instanceof ElementNotInteractableError ||
          // Firefox reports <option> elements as out of bounds
          error instanceof MoveTargetOutOfBoundsError
        ) {
          await element.click();
        } else {
          throw error;
        }
      }
    });
  }

  @span("driver.drag_slider", BaseDriver.spanAttrs)
  @stateful
  async dragSlider(id: number, value: number): Promise<void> {
    const element = await this.findElement(id);
    await this.#scrollElementIntoCenter(element);
    const slider = Slider.parse(
      await this.driver.executeScript<Slider["geometry"] | null>(
        Slider.EXECUTE_SCRIPT,
        element,
        value,
      ),
    );
    if (slider) {
      // ARIA sliders (e.g. <div role="slider">) only respond to real pointer drags.
      // Pointer offsets are relative to the element's center.
      const actions = this.driver.actions({ async: true });
      await actions
        .move({ origin: element, ...slider.startCenterOffset() })
        .press()
        .move({ origin: element, ...slider.endCenterOffset(), duration: 300 })
        .release()
        .perform();
    } else {
      await this.driver.executeScript(
        "arguments[0].value = arguments[1];" +
          "arguments[0].dispatchEvent(new Event('input', {bubbles: true}));" +
          "arguments[0].dispatchEvent(new Event('change', {bubbles: true}));",
        element,
        String(value),
      );
    }
  }

  @span("driver.drag_and_drop", BaseDriver.spanAttrs)
  @stateful
  async dragAndDrop(fromId: number, toId: number): Promise<void> {
    const fromElement = await this.findElement(fromId);
    const toElement = await this.findElement(toId);
    await this.#scrollElementIntoCenter(fromElement);
    const actions = this.driver.actions({ async: true });
    await actions.dragAndDrop(fromElement, toElement).perform();
  }

  @span("driver.hover", BaseDriver.spanAttrs)
  @stateful
  async hover(id: number): Promise<void> {
    const element = await this.findElement(id);
    await this.#scrollElementIntoCenter(element);
    const actions = this.driver.actions({ async: true });
    await actions.move({ origin: element }).perform();
  }

  @span("driver.press_key", BaseDriver.spanAttrs)
  @stateful
  pressKey(key: Keys.Key): Promise<void> {
    return this.#autoswitchToNewTabAction(async () => {
      const keyMap: Record<Keys.Key, string> = {
        Backspace: SeleniumKey.BACK_SPACE,
        Enter: SeleniumKey.ENTER,
        Escape: SeleniumKey.ESCAPE,
        Space: SeleniumKey.SPACE,
        Tab: SeleniumKey.TAB,
        ArrowDown: SeleniumKey.ARROW_DOWN,
        ArrowUp: SeleniumKey.ARROW_UP,
        ArrowLeft: SeleniumKey.ARROW_LEFT,
        ArrowRight: SeleniumKey.ARROW_RIGHT,
      };

      const actions = this.driver.actions({ async: true });
      await actions.sendKeys(keyMap[key]).perform();
    });
  }

  @span("driver.quit", BaseDriver.spanAttrs)
  async quit(): Promise<void> {
    await this.pageScriptsReady;
    this.closeConnections();

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

  @span("driver.back", BaseDriver.spanAttrs)
  @stateful
  async back(): Promise<void> {
    await this.driver.navigate().back();
  }

  @span("driver.visit", BaseDriver.spanAttrs)
  @stateful
  async visit(url: string): Promise<void> {
    await this.checkNavigationPolicy(url);
    await this.pageScriptsReady;
    await this.driver.get(url);
  }

  @span("driver.scroll_to", BaseDriver.spanAttrs)
  @stateful
  async scrollTo(id: number): Promise<void> {
    const element = await this.findElement(id);
    await this.#scrollElementIntoCenter(element);
  }

  @span("driver.title", BaseDriver.spanAttrs)
  title(): Promise<string> {
    return this.driver.getTitle();
  }

  @span("driver.type", BaseDriver.spanAttrs)
  @stateful
  async type(id: number, text: string): Promise<void> {
    const element = await this.findElement(id);
    await this.#scrollElementIntoCenter(element);
    await element.clear();
    await element.sendKeys(text);
  }

  @span("driver.upload", BaseDriver.spanAttrs)
  @stateful
  async upload(id: number, paths: string[]): Promise<void> {
    const element = await this.findElement(id);
    await element.sendKeys(paths.join("\n"));
  }

  @span("driver.url", BaseDriver.spanAttrs)
  url(): Promise<string> {
    return this.driver.getCurrentUrl();
  }

  @span("driver.app", BaseDriver.spanAttrs)
  async app(): Promise<AppId> {
    const currentUrl = await this.driver.getCurrentUrl();
    return AppId.parse(currentUrl);
  }

  @span("driver.execute_script", BaseDriver.spanAttrs)
  @stateful
  async executeScript(script: string): Promise<void> {
    await this.driver.executeScript(script);
  }

  @span("driver.switch_to_next_tab", BaseDriver.spanAttrs)
  async switchToNextTab(): Promise<void> {
    const handles = await this.driver.getAllWindowHandles();
    if (handles.length <= 1) return;

    const current = await this.driver.getWindowHandle();
    const currentIndex = handles.indexOf(current);
    const nextIndex = (currentIndex + 1) % handles.length;

    await this.switchToTab(handles, nextIndex);
    // TODO: Consider making these debug values lazy, so there's less overhead
    logger.debug(
      `Switched to next tab: ${await this.driver.getTitle()} (${await this.driver.getCurrentUrl()})`,
    );
  }

  @span("driver.switch_to_previous_tab", BaseDriver.spanAttrs)
  async switchToPreviousTab(): Promise<void> {
    const handles = await this.driver.getAllWindowHandles();
    if (handles.length <= 1) return;

    const current = await this.driver.getWindowHandle();
    const currentIndex = handles.indexOf(current);
    const prevIndex = (currentIndex - 1 + handles.length) % handles.length;

    await this.switchToTab(handles, prevIndex);
    // TODO: Consider making these debug values lazy, so there's less overhead
    logger.debug(
      `Switched to previous tab: ${await this.driver.getTitle()} (${await this.driver.getCurrentUrl()})`,
    );
  }

  @span("driver.wait", BaseDriver.spanAttrs)
  @stateful
  async wait(seconds: number): Promise<void> {
    const clampedSeconds = Math.max(1, Math.min(30, seconds));
    await new Promise((resolve) => setTimeout(resolve, clampedSeconds * 1000));
  }

  @span("driver.wait_for_selector", BaseDriver.spanAttrs)
  async waitForSelector(): Promise<void> {
    throw new Error("waitForSelector not supported for this driver");
  }

  async #scrollElementIntoCenter(element: WebElement): Promise<void> {
    await this.driver.executeScript(
      "arguments[0].scrollIntoView({block: 'center'});",
      element,
    );
  }

  async checkNavigationPolicy(url?: string): Promise<void> {
    const currentUrl = url ?? (await this.url());
    this.navigationPolicy.check(currentUrl);
  }

  @span("driver.wait_for_page_to_load", BaseDriver.spanAttrs)
  protected async waitForPageToLoad(): Promise<void> {
    await this.pageScriptsReady;

    try {
      const result = await waitForPageStability(() => this.waiterSnapshot());
      if (!result.loaded) {
        logger.warn(
          `Timed out waiting for page to load; pending requests: ${result.pending.join(", ")}`,
        );
      }
    } catch (error) {
      // Retry once on failure
      try {
        await waitForPageStability(() => this.waiterSnapshot());
      } catch (retryError) {
        logger.warn(
          `Failed to wait for page to load after retry (${String(error)}): ${String(retryError)}`,
        );
      }
    }
  }

  @stateful("switchToTab")
  private async switchToTab(
    handles: string[],
    tabIndex: number,
  ): Promise<void> {
    always(handles[tabIndex]);
    await this.driver.switchTo().window(handles[tabIndex]);
  }

  protected async waiterSnapshot(): Promise<WaiterSnapshot | null> {
    let snapshot = (await this.driver.executeScript(
      `return ${WAITER_SNAPSHOT_SCRIPT}`,
    )) as WaiterSnapshot | null;
    if (!snapshot) {
      await this.driver.executeScript(WAITER_SCRIPT);
      snapshot = (await this.driver.executeScript(
        `return ${WAITER_SNAPSHOT_SCRIPT}`,
      )) as typeof snapshot;
    }
    return snapshot;
  }

  protected withNavigationWait<Result>(
    fn: () => Promise<Result>,
  ): Promise<Result> {
    return fn();
  }

  async #autoswitchToNewTabAction<Result>(
    fn: () => Promise<Result>,
  ): Promise<Result> {
    if (!this.autoswitchToNewTab) {
      return await this.withNavigationWait(fn);
    }

    return tracer.span("driver.internal.switch_to_new_tab", async () => {
      const currentHandles = await this.driver.getAllWindowHandles();

      const result = await this.withNavigationWait(fn);

      const newHandles = await this.driver.getAllWindowHandles();
      const newTabs = newHandles.filter((h) => !currentHandles.includes(h));

      if (newTabs.length) {
        const lastNewTab = newTabs[newTabs.length - 1];
        always(lastNewTab);

        if (lastNewTab !== (await this.driver.getWindowHandle())) {
          await this.driver.switchTo().window(lastNewTab);
          logger.debug(
            `Auto-switching to new tab: ${await this.driver.getTitle()} (${await this.driver.getCurrentUrl()})`,
          );
        }
      }

      return result;
    });
  }
}
