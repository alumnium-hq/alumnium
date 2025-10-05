import { AccessibilityElement } from './AccessibilityElement.js';

export abstract class BaseAccessibilityTree {
  abstract toXml(): string;
  abstract elementById(id: number): AccessibilityElement;
  abstract getArea(id: number): BaseAccessibilityTree;
}
