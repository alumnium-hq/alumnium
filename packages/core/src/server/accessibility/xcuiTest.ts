import { BaseServerAccessibilityTree } from "./base.ts";

// TODO:
export class ServerXcuiTestAccessibilityTree extends BaseServerAccessibilityTree {
  // TODO:
  constructor(xml: string) {
    super();
  }

  toXml(_excludeAttrs: Set<string> | null = null): string {
    throw new Error("toXml is not implemented");
  }
}
