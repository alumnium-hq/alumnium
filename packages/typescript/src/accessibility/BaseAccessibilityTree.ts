import type { AccessibilityElement } from "./AccessibilityElement.ts";

export abstract class BaseAccessibilityTree {
  abstract toStr(): string;
  abstract elementById(id: number): AccessibilityElement;
  abstract scopeToArea(rawId: number): BaseAccessibilityTree;
}
