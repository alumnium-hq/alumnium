import { BaseAccessibilityTree } from '../accessibility/BaseAccessibilityTree';
import { Key } from './keys';

export abstract class BaseDriver {
  abstract get accessibilityTree(): BaseAccessibilityTree;
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
  abstract findElement(id: number): any;
  abstract hover(id: number): void | Promise<void>;
}
