import type { Alumni } from "alumnium";

export namespace McpLearn {
  export type Layer = "shared" | "product" | "web" | "ios" | "android";
}

export abstract class McpLearn {
  /**
   * Picks the knowledge of the layer, for the app or the one the driver is
   * on.
   */
  static layered(al: Alumni, layer: McpLearn.Layer, app?: string) {
    const knowledge = app ? al.knowledge.app(app) : al.knowledge;
    if (layer === "shared") return knowledge.shared();
    if (layer === "product") return knowledge;
    return knowledge.on(layer);
  }
}
