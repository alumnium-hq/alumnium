import { always } from "alwaysly";
import { Key as SeleniumKey, WebDriver, WebElement } from "selenium-webdriver";
import {
  ElementNotInteractableError,
  MoveTargetOutOfBoundsError,
  NoSuchSessionError,
} from "selenium-webdriver/lib/error.js";
import { Origin } from "selenium-webdriver/lib/input.js";
import {
  AppId,
  BaseDriver,
  ClickTool,
  DragAndDropTool,
  Env,
  HoverTool,
  Keys,
  PanInDirectionTool,
  PressKeyTool,
  ScrollInDirectionTool,
  scrollPoints,
  Slider,
  type SliderStep,
  Telemetry,
  type ToolClass,
  TypeTool,
  UploadTool,
  WAITER_SNAPSHOT_SCRIPT,
  waiterScriptSource,
  type WaiterSnapshot,
  waitForPageStability,
  ZoomTool,
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
    const isSlider = await Slider.set({
      next: (reset) =>
        this.driver.executeScript<SliderStep | null>(
          Slider.EXECUTE_SCRIPT,
          element,
          value,
          reset,
        ),
      // Pointer offsets are relative to the element's center. The pointer stays
      // pressed between performs until it is released.
      down: (point) =>
        this.driver
          .actions({ async: true })
          .move({ origin: element, ...point.centerOffset() })
          .press()
          .perform(),
      move: (point) =>
        this.driver
          .actions({ async: true })
          .move({ origin: element, ...point.centerOffset(), duration: 100 })
          .perform(),
      up: () => this.driver.actions({ async: true }).release().perform(),
    });
    if (!isSlider) {
      await this.driver.executeScript(
        Slider.SET_INPUT_VALUE_SCRIPT,
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
        Home: SeleniumKey.HOME,
        End: SeleniumKey.END,
        PageUp: SeleniumKey.PAGE_UP,
        PageDown: SeleniumKey.PAGE_DOWN,
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

  @span("driver.scroll_in_direction", BaseDriver.spanAttrs)
  @stateful
  async scrollInDirection(
    id: number,
    direction: ScrollInDirectionTool.Direction,
  ): Promise<void> {
    const area = (await this.driver.executeScript(
      ScrollInDirectionTool.SCROLL_AREA_SCRIPT,
      await this.findElement(id),
    )) as ScrollInDirectionTool.Area | null;
    if (!area) throw new Error(`Element ${id} has no visible scroll area`);
    const { deltaX, deltaY } = ScrollInDirectionTool.wheelDelta(
      direction,
      area,
    );
    await this.driver
      .actions({ async: true })
      // @ts-expect-error -- Actions.scroll() exists since selenium-webdriver 4.2 but is missing from @types/selenium-webdriver.
      .scroll(
        Math.round(area.viewportX),
        Math.round(area.viewportY),
        deltaX,
        deltaY,
        Origin.VIEWPORT,
      )
      .perform();
    await this.driver.sleep(ScrollInDirectionTool.SETTLE_DELAY);
  }

  @span("driver.pan_in_direction", BaseDriver.spanAttrs)
  @stateful
  async panInDirection(
    id: number,
    direction: PanInDirectionTool.Direction,
  ): Promise<void> {
    const element = await this.findElement(id);
    await this.#scrollElementIntoCenter(element);
    // Pointer offsets are relative to the element's center.
    const { width, height } = await this.#visibleSize(element);
    const { start, end } = scrollPoints(
      { x: -width / 2, y: -height / 2, width, height },
      direction,
    );
    // Drag like a user: maps ignore a press and release without moves between,
    // and fling when released while the pointer is still moving.
    const actions = this.driver
      .actions({ async: true })
      .move({ origin: element, x: Math.round(start.x), y: Math.round(start.y) })
      .press();
    for (let step = 1; step <= PanInDirectionTool.STEPS; step++) {
      const progress = step / PanInDirectionTool.STEPS;
      actions.move({
        origin: element,
        x: Math.round(start.x + (end.x - start.x) * progress),
        y: Math.round(start.y + (end.y - start.y) * progress),
        duration: 20,
      });
    }
    await actions.pause(PanInDirectionTool.HOLD_DELAY).release().perform();
    await this.driver.sleep(PanInDirectionTool.SETTLE_DELAY);
  }

  @span("driver.zoom", BaseDriver.spanAttrs)
  @stateful
  async zoom(id: number, direction: ZoomTool.Direction): Promise<void> {
    const element = await this.findElement(id);
    await this.#scrollElementIntoCenter(element);
    // Wheel with Control held is what a trackpad pinch sends. Maps zoom on it
    // even when they leave the plain wheel to the page.
    // Each wheel move is performed on its own: Chrome drops moves that are
    // chained into one sequence. Control stays held between performs.
    await this.driver
      .actions({ async: true })
      .keyDown(SeleniumKey.CONTROL)
      .perform();
    try {
      for (let step = 0; step < ZoomTool.WHEEL_STEPS; step++) {
        await this.driver
          .actions({ async: true })
          // @ts-expect-error -- Actions.scroll() exists since selenium-webdriver 4.2 but is missing from @types/selenium-webdriver.
          .scroll(0, 0, 0, ZoomTool.wheelDelta(direction), element)
          .perform();
      }
    } finally {
      await this.driver
        .actions({ async: true })
        .keyUp(SeleniumKey.CONTROL)
        .perform();
    }
    await this.driver.sleep(ZoomTool.SETTLE_DELAY);
  }

  /** The size of the element, limited to what fits on screen. */
  async #visibleSize(
    element: WebElement,
  ): Promise<{ width: number; height: number }> {
    const rect = await element.getRect();
    const [width, height] = await this.driver.executeScript<[number, number]>(
      "return [window.innerWidth, window.innerHeight];",
    );
    return {
      width: Math.min(rect.width, width),
      height: Math.min(rect.height, height),
    };
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
