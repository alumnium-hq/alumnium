import { BaseAccessibilityTree } from "../accessibility/BaseAccessibilityTree.js";
import { Element } from "./index.js";
import { Key } from "./keys.js";

export abstract class BaseDriver {
  abstract platform: string;
  abstract getAccessibilityTree(): Promise<BaseAccessibilityTree>;
  abstract click(id: number): void | Promise<void>;
  abstract dragAndDrop(fromId: number, toId: number): void | Promise<void>;
  abstract pressKey(key: Key): void | Promise<void>;
  abstract quit(): void | Promise<void>;
  abstract back(): void | Promise<void>;
  abstract screenshot(): string | Promise<string>;
  abstract select(id: number, option: string): void | Promise<void>;
  abstract title(): string | Promise<string>;
  abstract type(id: number, text: string): void | Promise<void>;
  abstract url(): string | Promise<string>;
  abstract findElement(id: number): Element | Promise<Element>;
  abstract hover(id: number): void | Promise<void>;
  abstract visit(url: string): void | Promise<void>;
  abstract scrollTo(id: number): void | Promise<void>;
  abstract executeScript(script: string): void | Promise<void>;
}
