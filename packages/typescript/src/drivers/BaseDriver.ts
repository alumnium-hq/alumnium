import { BaseAccessibilityTree } from "../accessibility/BaseAccessibilityTree.js";
import { ToolClass } from "../tools/BaseTool.js";
import { Element } from "./index.js";
import { Key } from "./keys.js";

export abstract class BaseDriver {
  abstract platform: string;
  abstract supportedTools: Set<ToolClass>;
  abstract getAccessibilityTree(): Promise<BaseAccessibilityTree>;
  abstract click(id: number): Promise<void>;
  abstract dragSlider(id: number, value: number): void | Promise<void>;
  abstract dragAndDrop(fromId: number, toId: number): Promise<void>;
  abstract pressKey(key: Key): Promise<void>;
  abstract quit(): Promise<void>;
  abstract back(): Promise<void>;
  abstract screenshot(): string | Promise<string>;
  abstract title(): string | Promise<string>;
  abstract type(id: number, text: string): Promise<void>;
  abstract url(): string | Promise<string>;
  abstract app(): string | Promise<string>;
  abstract findElement(id: number): Promise<Element>;
  abstract visit(url: string): Promise<void>;
  abstract scrollTo(id: number): void | Promise<void>;
  abstract executeScript(script: string): void | Promise<void>;
  abstract switchToNextTab(): void | Promise<void>;
  abstract switchToPreviousTab(): void | Promise<void>;
  abstract wait(seconds: number): void | Promise<void>;
  abstract waitForSelector(
    selector: string,
    timeout?: number
  ): void | Promise<void>;
  abstract printToPdf(filepath: string): void | Promise<void>;
}
