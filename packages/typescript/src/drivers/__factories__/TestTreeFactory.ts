import type { AccessibilityElement } from "../../accessibility/AccessibilityElement.ts";
import { BaseAccessibilityTree } from "../../accessibility/BaseAccessibilityTree.ts";

export abstract class TestTreeFactory {
  static tree(element: AccessibilityElement): BaseAccessibilityTree {
    return new this.Tree(element);
  }

  static Tree = class TestTree extends BaseAccessibilityTree {
    readonly element: AccessibilityElement;

    constructor(element: AccessibilityElement) {
      super();
      this.element = element;
    }

    toStr(): string {
      return "";
    }

    elementById(): AccessibilityElement {
      return this.element;
    }

    scopeToArea(): BaseAccessibilityTree {
      return this;
    }
  };
}
