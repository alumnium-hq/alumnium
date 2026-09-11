import { MaestroAccessibilityTree } from "../accessibility/MaestroAccessibilityTree.ts";
import type { AccessibilityElement } from "../accessibility/AccessibilityElement.ts";
import type { BaseAccessibilityTree } from "../accessibility/BaseAccessibilityTree.ts";
import { AppId } from "../AppId.ts";
import { Telemetry } from "../telemetry/Telemetry.ts";
import { TreeDevDrillError } from "../tree/dev/TreeDevDrillError.ts";
import type { Tracer } from "../telemetry/Tracer.ts";
import type { ToolClass } from "../tools/BaseTool.ts";
import { ClickTool } from "../tools/ClickTool.ts";
import { PressKeyTool } from "../tools/PressKeyTool.ts";
import { TypeTool } from "../tools/TypeTool.ts";
import { BaseDriver } from "./BaseDriver.ts";
import type { Element } from "./index.ts";
import type { Keys } from "./keys.ts";
import { MaestroSession } from "./MaestroSession.ts";
import { sleep } from "../utils/timers.ts";
import { lit } from "smollit";

const { tracer, logger } = Telemetry.get(import.meta.url);
const { span } = tracer.dec();
const stateful = BaseDriver.stateful;

export class MaestroDriver extends BaseDriver {
  public platform = "maestro" as const;

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

  @span("driver.get_accessibility_tree", spanAttrs)
  protected async fetchAccessibilityTree(): Promise<BaseAccessibilityTree> {
    if (this.delay > 0) await sleep(this.delay * 1000);
    const hierarchy = await this.session.inspectScreen();
    return new MaestroAccessibilityTree(hierarchy);
  }

  @span("driver.click", spanAttrs)
  @stateful
  async click(id: number): Promise<void> {
    const { x, y } = await this.#pointOf(id);
    await this.session.run(lit`
      - tapOn:
          point: "${x},${y}"
    `);
  }

  @span("driver.type", spanAttrs)
  @stateful
  async type(id: number, text: string): Promise<void> {
    const { x, y } = await this.#pointOf(id);
    await this.session.run(lit`
      - tapOn:
          point: "${x},${y}"
      - inputText: ${JSON.stringify(text)}
    `);
    if (this.hideKeyboardAfterTyping) {
      await this.session.run("- hideKeyboard\n");
    }
  }

  @span("driver.press_key", spanAttrs)
  @stateful
  async pressKey(key: Keys.Key): Promise<void> {
    await this.session.run(`- pressKey: ${key}`);
  }

  @span("driver.back", spanAttrs)
  @stateful
  async back(): Promise<void> {
    await this.session.run("- back");
  }

  @span("driver.visit", spanAttrs)
  @stateful
  async visit(url: string): Promise<void> {
    await this.session.run(`- openLink: ${JSON.stringify(url)}`);
  }

  @span("driver.screenshot", spanAttrs)
  screenshot(): Promise<string> {
    return this.session.screenshot();
  }

  @span("driver.app", spanAttrs)
  app(): Promise<AppId> {
    return Promise.resolve(AppId.parse(this.session.appId));
  }

  @span("driver.title", spanAttrs)
  title(): string {
    return "";
  }

  @span("driver.url", spanAttrs)
  url(): string {
    return "";
  }

  @span("driver.wait", spanAttrs)
  @stateful
  async wait(seconds: number): Promise<void> {
    const clampedSeconds = Math.max(1, Math.min(30, seconds));
    await sleep(clampedSeconds * 1000);
  }

  @span("driver.quit", spanAttrs)
  async quit(): Promise<void> {
    await this.session.close();
  }

  //#region Unsupported

  /** Maestro has no programmatic access to elements. */
  @span("driver.find_element", spanAttrs)
  findElement(): Promise<Element> {
    throw new Error("Element handles are not supported on Maestro");
  }

  @span("driver.drag_slider", spanAttrs)
  dragSlider(): void {
    throw new Error("Dragging slider is not supported on Maestro");
  }

  @span("driver.drag_and_drop", spanAttrs)
  dragAndDrop(): Promise<void> {
    throw new Error("Dragging and dropping is not supported on Maestro");
  }

  @span("driver.scroll_to", spanAttrs)
  scrollTo(): Promise<void> {
    throw new Error("Scrolling to element is not supported on Maestro");
  }

  @span("driver.execute_script", spanAttrs)
  executeScript(): Promise<void> {
    throw new Error("Executing scripts is not supported on Maestro");
  }

  @span("driver.switch_to_next_tab", spanAttrs)
  switchToNextTab(): Promise<void> {
    throw new Error("Tab switching not supported on Maestro");
  }

  @span("driver.switch_to_previous_tab", spanAttrs)
  switchToPreviousTab(): Promise<void> {
    throw new Error("Tab switching not supported on Maestro");
  }

  @span("driver.wait_for_selector", spanAttrs)
  waitForSelector(): Promise<void> {
    throw new Error("waitForSelector not supported on Maestro");
  }

  @span("driver.print_to_pdf", spanAttrs)
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
      element = tree.elementById(rawId);
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

  async #elementOf(id: number): Promise<{ bounds: string }> {
    const tree = await this.getAccessibilityTree();
    const element = tree.elementById(id);
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

function spanAttrs(this: MaestroDriver): Tracer.SpansDriverAttrs {
  return {
    "driver.kind": "maestro",
    "driver.platform": this.platform,
  };
}
