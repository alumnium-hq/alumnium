import type { BaseAccessibilityTree } from "../accessibility/BaseAccessibilityTree.ts";
import { AppId } from "../AppId.ts";
import type { ToolClass } from "../tools/BaseTool.ts";
import type { Driver } from "./Driver.ts";
import type { Element } from "./index.ts";
import type { Keys } from "./keys.ts";

export abstract class BaseDriver {
  abstract platform: Driver.Platform;
  abstract supportedTools: Set<ToolClass>;
  abstract getAccessibilityTree(): Promise<BaseAccessibilityTree>;
  abstract click(id: number): Promise<void>;
  abstract dragSlider(id: number, value: number): void | Promise<void>;
  abstract dragAndDrop(fromId: number, toId: number): Promise<void>;
  abstract pressKey(key: Keys.Key): Promise<void>;
  abstract quit(): Promise<void>;
  abstract back(): Promise<void>;
  abstract screenshot(): Promise<string>;
  abstract title(): Promise<string>;
  abstract type(id: number, text: string): Promise<void>;
  abstract url(): Promise<string>;
  abstract app(): Promise<AppId>;
  abstract findElement(id: number): Promise<Element>;
  abstract visit(url: string): Promise<void>;
  abstract scrollTo(id: number): Promise<void>;
  abstract executeScript(script: string): Promise<void>;
  abstract switchToNextTab(): Promise<void>;
  abstract switchToPreviousTab(): Promise<void>;
  abstract wait(seconds: number): Promise<void>;
  abstract waitForSelector(selector: string, timeout?: number): Promise<void>;
  abstract printToPdf(filepath: string): Promise<void>;
}
