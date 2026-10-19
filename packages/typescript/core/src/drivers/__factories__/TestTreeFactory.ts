import type { AccessibilityElement } from "../../accessibility/AccessibilityElement.ts";
import { BaseAccessibilityTree } from "../../accessibility/BaseAccessibilityTree.ts";

export abstract class TestTreeFactory {
  static tree(
    element: AccessibilityElement,
  ): BaseAccessibilityTree<AccessibilityElement> {
    return new TestTree(element);
  }
}

class TestTree extends BaseAccessibilityTree<AccessibilityElement> {
  readonly element: AccessibilityElement;

  constructor(element: AccessibilityElement) {
    super(element);
    this.element = element;
  }

  async toStr(): Promise<string> {
    return "";
  }

  async elementById(): Promise<AccessibilityElement> {
    return this.element;
  }

  async scopeToArea(): Promise<BaseAccessibilityTree<AccessibilityElement>> {
    return this;
  }
}
