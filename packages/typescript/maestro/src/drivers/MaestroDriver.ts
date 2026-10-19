import { lit } from "smollit";
import {
  type AccessibilityElement,
  AppId,
  type BaseAccessibilityTree,
  BaseDriver,
  ClickTool,
  type Driver,
  type Keys,
  PressKeyTool,
  sleep,
  Telemetry,
  type ToolClass,
  TreeDevDrillError,
  TypeTool,
} from "@alumnium/core/internal";
import { MaestroAccessibilityTree } from "../accessibility/MaestroAccessibilityTree.ts";
import { MaestroSession } from "./MaestroSession.ts";

const { tracer, logger } = Telemetry.get(import.meta.url);
const { span } = tracer.dec();
const stateful = BaseDriver.stateful;

export class MaestroDriver extends BaseDriver<never> {
  public kind = "maestro" as const;

  get platform(): Driver.MobileOs {
    return this.session.os;
  }

  public supportedTools: Set<ToolClass> = new Set([
    ClickTool,
    PressKeyTool,
    TypeTool,
  ]);

  public delay: number = 0;
  public hideKeyboardAfterTyping: boolean = false;

  readonly session: MaestroSession;

  constructor(session: MaestroSession) {
    super();
    this.session = session;
  }

  @span("driver.fetch_accessibility_tree", BaseDriver.spanAttrs)
  protected async fetchAccessibilityTree(): Promise<BaseAccessibilityTree> {
    if (this.delay > 0) await sleep(this.delay * 1000);
    const hierarchy = await this.session.inspectScreen();
    return new MaestroAccessibilityTree(hierarchy);
  }

  @span("driver.click", BaseDriver.spanAttrs)
  @stateful
  async click(id: number): Promise<void> {
    const { x, y } = await this.#pointOf(id);
    await this.session.run(lit`
      - tapOn:
          point: "${x},${y}"
    `);
  }

  @span("driver.type", BaseDriver.spanAttrs)
  @stateful
  async type(id: number, text: string): Promise<void> {
    const { x, y } = await this.#pointOf(id);
    await this.session.run(lit`
      - tapOn:
          point: "${x},${y}"
      - inputText: ${JSON.stringify(text)}
    `);

    if (this.hideKeyboardAfterTyping && (await this.#keyboardShown())) {
      await this.session.run("- hideKeyboard");
    }
  }

  @span("driver.press_key", BaseDriver.spanAttrs)
  @stateful
  async pressKey(key: Keys.Key): Promise<void> {
    await this.session.run(`- pressKey: ${key}`);
  }

  @span("driver.back", BaseDriver.spanAttrs)
  @stateful
  async back(): Promise<void> {
    await this.session.run("- back");
  }

  @span("driver.visit", BaseDriver.spanAttrs)
  @stateful
  async visit(url: string): Promise<void> {
    await this.session.run(`- openLink: ${JSON.stringify(url)}`);
  }

  @span("driver.screenshot", BaseDriver.spanAttrs)
  screenshot(): Promise<string> {
    return this.session.screenshot();
  }

  @span("driver.app", BaseDriver.spanAttrs)
  async app(): Promise<AppId> {
    return AppId.parse(this.session.appId);
  }

  @span("driver.title", BaseDriver.spanAttrs)
  async title(): Promise<string> {
    return "";
  }

  @span("driver.url", BaseDriver.spanAttrs)
  async url(): Promise<string> {
    return "";
  }

  @span("driver.wait", BaseDriver.spanAttrs)
  @stateful
  async wait(seconds: number): Promise<void> {
    const clampedSeconds = Math.max(1, Math.min(30, seconds));
    await sleep(clampedSeconds * 1000);
  }

  @span("driver.quit", BaseDriver.spanAttrs)
  async quit(): Promise<void> {
    await this.session.close();
  }

  //#region Unsupported

  /** Maestro has no programmatic access to elements. */
  @span("driver.find_element", BaseDriver.spanAttrs)
  findElement(): Promise<never> {
    throw new Error("Element handles are not supported on Maestro");
  }

  @span("driver.drag_slider", BaseDriver.spanAttrs)
  async dragSlider(): Promise<void> {
    throw new Error("Dragging slider is not supported on Maestro");
  }

  @span("driver.drag_and_drop", BaseDriver.spanAttrs)
  dragAndDrop(): Promise<void> {
    throw new Error("Dragging and dropping is not supported on Maestro");
  }

  @span("driver.scroll_to", BaseDriver.spanAttrs)
  scrollTo(): Promise<void> {
    throw new Error("Scrolling to element is not supported on Maestro");
  }

  @span("driver.execute_script", BaseDriver.spanAttrs)
  executeScript(): Promise<void> {
    throw new Error("Executing scripts is not supported on Maestro");
  }

  @span("driver.switch_to_next_tab", BaseDriver.spanAttrs)
  switchToNextTab(): Promise<void> {
    throw new Error("Tab switching not supported on Maestro");
  }

  @span("driver.switch_to_previous_tab", BaseDriver.spanAttrs)
  switchToPreviousTab(): Promise<void> {
    throw new Error("Tab switching not supported on Maestro");
  }

  @span("driver.wait_for_selector", BaseDriver.spanAttrs)
  waitForSelector(): Promise<void> {
    throw new Error("waitForSelector not supported on Maestro");
  }

  @span("driver.print_to_pdf", BaseDriver.spanAttrs)
  printToPdf(): Promise<void> {
    throw new Error("Printing to PDF not supported on Maestro");
  }

  checkNavigationPolicy(_url?: string): void {
    // Maestro drives native apps that have no URL, so there is nothing to check.
  }

  //#endregion

  //#region Dev

  /**
   * Resolves a raw id to the tap target it would produce, so the tree drill can report which ids
   * are actionable. Maestro has no locators, so the bounds string stands in for one.
   */
  protected override async devDrillProbeTree(
    tree: BaseAccessibilityTree,
    rawId: number,
  ): Promise<string> {
    let element: AccessibilityElement;
    try {
      element = await tree.elementById(rawId);
    } catch (error) {
      throw new TreeDevDrillError("resolve", error);
    }

    const bounds = element.maestroBounds;
    try {
      if (!bounds) throw new Error(`No bounds for raw_id=${rawId}`);
      const { x, y } = MaestroAccessibilityTree.centreOf(bounds);
      return `point:${x},${y}`;
    } catch (error) {
      throw new TreeDevDrillError("probe", error, bounds);
    }
  }

  //#endregion

  /**
   * On Android, Maestro's `hideKeyboard` is a Back press, which leaves the current screen when
   * no keyboard is up. So only hide a keyboard the view hierarchy actually show keyboard.
   * iOS keyboard is safe to hide even if it's not shown.
   */
  async #keyboardShown(): Promise<boolean> {
    if (this.session.os !== "android") return true;

    const hierarchy = await this.session.inspectScreen();
    const tree = new MaestroAccessibilityTree(hierarchy);
    return tree.hasResourceId("android:id/inputArea");
  }

  async #elementOf(id: number): Promise<{ bounds: string }> {
    const tree = await this.getAccessibilityTree();
    const element = await tree.elementById(id);
    const bounds = element.maestroBounds;
    if (!bounds) {
      throw new Error(`Element with raw_id=${id} has no bounds to act on`);
    }
    return { bounds };
  }

  async #pointOf(id: number): Promise<{ x: number; y: number }> {
    const { bounds } = await this.#elementOf(id);
    const point = MaestroAccessibilityTree.centreOf(bounds);
    logger.debug(`Resolved raw_id=${id} to point ${point.x},${point.y}`);
    return point;
  }
}
