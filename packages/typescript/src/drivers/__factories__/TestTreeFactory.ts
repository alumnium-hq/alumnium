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

  toStr(): string {
    return "";
  }

  elementById(): AccessibilityElement {
    return this.element;
  }

  scopeToArea(): BaseAccessibilityTree<AccessibilityElement> {
    return this;
  }
}
