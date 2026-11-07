import type { Alumni } from "alumnium";

export namespace McpLearn {
  export type Layer = "shared" | "product" | "web" | "ios" | "android";
}

export abstract class McpLearn {
  /** Picks the knowledge of the layer. */
  static layered(al: Alumni, layer: McpLearn.Layer) {
    if (layer === "shared") return al.knowledge.shared();
    if (layer === "product") return al.knowledge;
    return al.knowledge.on(layer);
  }
}
