import type { BaseAccessibilityTree } from "../accessibility/BaseAccessibilityTree.js";
import { AppId } from "../AppId.js";
import { Platform } from "../server/Platform.js";
import type { ToolClass } from "../tools/BaseTool.js";
import type { Element } from "./index.js";
import type { Keys } from "./keys.js";

export abstract class BaseDriver {
  abstract platform: Platform;
  abstract supportedTools: Set<ToolClass>;
  abstract getAccessibilityTree(): Promise<BaseAccessibilityTree>;
  abstract click(id: number): Promise<void>;
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
}
