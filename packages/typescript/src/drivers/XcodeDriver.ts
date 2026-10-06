import { XcodeAccessibilityTree } from "../accessibility/XcodeAccessibilityTree.ts";
import { AppId } from "../AppId.ts";
import { Telemetry } from "../telemetry/Telemetry.ts";
import type { ToolClass } from "../tools/BaseTool.ts";
import { ClickTool } from "../tools/ClickTool.ts";
import { DragAndDropTool } from "../tools/DragAndDropTool.ts";
import { DragSliderTool } from "../tools/DragSliderTool.ts";
import { NavigateBackTool } from "../tools/NavigateBackTool.ts";
import { PressKeyTool } from "../tools/PressKeyTool.ts";
import { ScrollTool } from "../tools/ScrollTool.ts";
import { TypeTool } from "../tools/TypeTool.ts";
import { sleep } from "../utils/timers.ts";
import { BaseDriver } from "./BaseDriver.ts";
import type { Element } from "./index.ts";
import type { Keys } from "./keys.ts";
import type { XcodeSession } from "./XcodeSession.ts";

const { tracer } = Telemetry.get(import.meta.url);
const { span } = tracer.dec();
const stateful = BaseDriver.stateful;

export class XcodeDriver extends BaseDriver {
  kind = "xcode" as const;
  platform = "ios" as const;
  supportedTools: Set<ToolClass> = new Set([
    ClickTool,
    DragAndDropTool,
    DragSliderTool,
    NavigateBackTool,
    PressKeyTool,
    ScrollTool,
    TypeTool,
  ]);
  delay = 0;
  readonly session: XcodeSession;

  constructor(session: XcodeSession) {
    super();
    this.session = session;
  }

  @span("driver.fetch_accessibility_tree", BaseDriver.spanAttrs)
  protected async fetchAccessibilityTree(): Promise<XcodeAccessibilityTree> {
    if (this.delay > 0) await sleep(this.delay * 1000);
    return (await this.session.capture()).tree;
  }

  @span("driver.click", BaseDriver.spanAttrs)
  @stateful
  async click(id: number): Promise<void> {
    const node = await this.#resolve(id);
    const point = this.#pointOf(node);
    await this.#perform(`t ${point.x} ${point.y}`, node.activationBundleId);
  }

  @span("driver.type", BaseDriver.spanAttrs)
  @stateful
  async type(id: number, text: string): Promise<void> {
    const node = await this.#resolve(id);
    const point = this.#pointOf(node);
    await this.#perform(`t ${point.x} ${point.y}`, node.activationBundleId);
    // XCTest types into the focused control. Delete its current value before replacing it.
    const focused = await this.#resolveNode(node);
    const value =
      focused.value === focused.attributes["placeholderValue"]
        ? ""
        : (focused.value ?? "");

    const input = "\b".repeat([...value].length) + text;
    if (input) {
      await this.#perform(`sender keyboard kbd ${this.#encodeText(input)}`);
    }
  }

  @span("driver.press_key", BaseDriver.spanAttrs)
  @stateful
  async pressKey(key: Keys.Key): Promise<void> {
    const keys: Record<Keys.Key, string> = {
      Backspace: "\b",
      Enter: "\n",
      Tab: "\t",
      Escape: "\u001b",
      Space: " ",
      // XCUIKeyboardKey arrow values (NS*ArrowFunctionKey).
      ArrowUp: "\uf700",
      ArrowDown: "\uf701",
      ArrowLeft: "\uf702",
      ArrowRight: "\uf703",
    };
    await this.#perform(`sender keyboard kbd ${this.#encodeText(keys[key])}`);
  }

  @span("driver.drag_and_drop", BaseDriver.spanAttrs)
  @stateful
  async dragAndDrop(fromId: number, toId: number): Promise<void> {
    const previous = await this.#tree();
    const from = previous.elementById(fromId);
    const to = previous.elementById(toId);
    if (from.activationBundleId !== to.activationBundleId)
      throw new Error("Xcode cannot drag between applications");
    const fresh = (
      await this.session.capture(undefined, from.activationBundleId)
    ).tree;
    const start = fresh.resolve(from);
    const end = fresh.resolve(to);
    if (start.activationBundleId !== end.activationBundleId)
      throw new Error("Xcode cannot drag between applications");
    const a = this.#pointOf(start);
    const b = this.#pointOf(end);
    await this.#perform(
      `drag ${a.x} ${a.y} ${b.x} ${b.y}`,
      start.activationBundleId,
    );
  }

  @span("driver.drag_slider", BaseDriver.spanAttrs)
  @stateful
  async dragSlider(id: number, value: number): Promise<void> {
    if (value < 0 || value > 100)
      throw new Error("Slider value must be between 0 and 100");
    const node = await this.#resolve(id);
    if (node.type !== "Slider" || !node.frame)
      throw new Error("Xcode target must be a slider with a frame");
    const start = this.#pointOf(node);
    const end = node.frame.x + (node.frame.width * value) / 100;
    await this.#perform(
      `drag ${start.x} ${start.y} ${end} ${start.y}`,
      node.activationBundleId,
    );
  }

  @span("driver.scroll_to", BaseDriver.spanAttrs)
  @stateful
  async scrollTo(id: number): Promise<void> {
    const target = (await this.#tree()).elementById(id);
    for (let attempt = 0; attempt < 10; attempt++) {
      const tree = (await this.session.capture()).tree;
      const node = tree.resolve(target);
      if (node.hitPoint) return;
      let container = node.parent;
      while (
        container &&
        !["ScrollView", "Table", "CollectionView", "Window"].includes(
          container.type,
        )
      )
        container = container.parent;
      if (!container?.frame || !node.frame)
        throw new Error(
          "Xcode cannot determine a scroll container for this element",
        );
      const frame = container.frame;
      const x = frame.x + frame.width / 2;
      const top = frame.y + frame.height * 0.25;
      const bottom = frame.y + frame.height * 0.75;
      const up = node.frame.y > frame.y + frame.height / 2;
      await this.#perform(
        `t ${x} ${up ? bottom : top} f ${x} ${up ? top : bottom} 0.3`,
        node.activationBundleId,
      );
    }
    throw new Error("Xcode element did not become hittable after scrolling");
  }

  @span("driver.back", BaseDriver.spanAttrs)
  @stateful
  async back(): Promise<void> {
    const tree = (await this.session.capture()).tree;
    const bar = tree.find((node) => node.type === "NavigationBar");
    const back = bar?.children.find(
      (node) =>
        node.type === "Button" &&
        node.hitPoint &&
        (/^back$/i.test(node.label ?? "") ||
          /^(back|back-button|backButton)$/i.test(node.identifier ?? "")),
    );
    if (!back) {
      const window = tree.find((node) => node.type === "Window");
      if (!bar || !window?.frame)
        throw new Error("Xcode could not find a navigation back button");
      // UIKit often labels Back with the previous screen's title. Use its edge gesture then.
      const frame = window.frame;
      const y = frame.y + frame.height / 2;
      await this.#perform(
        `t ${frame.x + 1} ${y} f ${frame.x + frame.width * 0.75} ${y} 0.3`,
        window.activationBundleId,
      );
      return;
    }
    const point = this.#pointOf(back);
    await this.#perform(`t ${point.x} ${point.y}`, back.activationBundleId);
  }

  @span("driver.wait", BaseDriver.spanAttrs)
  @stateful
  async wait(seconds: number): Promise<void> {
    await this.#perform(`w ${Math.max(1, Math.min(30, seconds))}`);
  }

  @span("driver.screenshot", BaseDriver.spanAttrs)
  screenshot(): Promise<string> {
    return this.session.screenshot();
  }

  @span("driver.quit", BaseDriver.spanAttrs)
  quit(): Promise<void> {
    return this.session.close();
  }

  app(): AppId {
    return AppId.parse(this.session.appId);
  }

  title(): string {
    return "";
  }

  url(): string {
    return "";
  }

  checkNavigationPolicy(): void {}

  //#region Unsupported

  findElement(): Promise<Element> {
    throw new Error("Element handles are not supported on Xcode");
  }

  visit(): Promise<void> {
    throw new Error("Opening URLs is not supported by Xcode MCP");
  }

  executeScript(): Promise<void> {
    throw new Error("Executing JavaScript is not supported on Xcode");
  }

  switchToNextTab(): Promise<void> {
    throw new Error("Tab switching is not supported on Xcode");
  }

  switchToPreviousTab(): Promise<void> {
    throw new Error("Tab switching is not supported on Xcode");
  }

  waitForSelector(): Promise<void> {
    throw new Error("CSS selectors are not supported on Xcode");
  }

  printToPdf(): Promise<void> {
    throw new Error("Printing to PDF is not supported on Xcode");
  }

  //#endregion

  async #tree(): Promise<XcodeAccessibilityTree> {
    return (await this.getAccessibilityTree()) as XcodeAccessibilityTree;
  }

  async #resolve(id: number): Promise<XcodeAccessibilityTree.Node> {
    return this.#resolveNode((await this.#tree()).elementById(id));
  }

  async #resolveNode(
    target: XcodeAccessibilityTree.Node,
  ): Promise<XcodeAccessibilityTree.Node> {
    // Activating another app can move its windows; resolve only after activation.
    return (
      await this.session.capture(undefined, target.activationBundleId)
    ).tree.resolve(target);
  }

  async #perform(command: string, bundleId?: string): Promise<void> {
    try {
      await this.session.capture(command, bundleId);
    } finally {
      this.resetAccessibilityTree();
    }
  }

  #pointOf(node: XcodeAccessibilityTree.Node): XcodeAccessibilityTree.Point {
    if (!node.hitPoint || node.attributes["enabled"] === "false") {
      throw new Error(
        `Xcode element ${node.identifier || node.label || node.type} is not hittable`,
      );
    }
    return node.hitPoint;
  }

  #encodeText(text: string): string {
    // Encode every character, including literal backslashes, so user text cannot become commands.
    return [...text]
      .map((character) => `\\u{${character.codePointAt(0)!.toString(16)}}`)
      .join("");
  }
}
