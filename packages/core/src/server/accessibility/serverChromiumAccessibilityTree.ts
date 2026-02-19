import { BaseServerAccessibilityTree } from "./baseServerAccessibilityTree.ts";

// TODO:
export class ServerChromiumAccessibilityTree extends BaseServerAccessibilityTree {
  // TODO:
  constructor(xml: string) {
    super();
  }

  toXml(_excludeAttrs: Set<string> | null = null): string {
    throw new Error("toXml is not implemented");
  }
}
