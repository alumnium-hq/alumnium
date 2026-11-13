import z from "zod";
import type { Driver } from "../../drivers/Driver.ts";

export namespace KnowledgeLayer {
  export type Platform = z.infer<typeof KnowledgeLayer.Platform>;

  export type Layer = z.infer<typeof KnowledgeLayer.Layer>;
}

/**
 * Layers lessons persist in, from the least to the most specific: lessons
 * shared by all products, lessons of a product on every platform, and lessons
 * of a product on one platform. On the same kind and instruction, the more
 * specific layer wins.
 */
export abstract class KnowledgeLayer {
  static Platform = z.enum(["web", "ios", "android"]);

  static Layer = z.enum(["shared", "product", "web", "ios", "android"]);

  /** Layers in precedence order, the least specific first. */
  static PRECEDENCE: readonly KnowledgeLayer.Layer[] = [
    "shared",
    "product",
    "web",
    "ios",
    "android",
  ];

  static DEFAULT: KnowledgeLayer.Layer = "product";

  /** Platform layer of sessions on the platform. */
  static platform(platform: Driver.Platform): KnowledgeLayer.Platform {
    return platform === "chromium" || platform === "firefox" ? "web" : platform;
  }

  /** Layers that apply to sessions on the platform, in precedence order. */
  static applicable(platform: KnowledgeLayer.Platform): KnowledgeLayer.Layer[] {
    return ["shared", "product", platform];
  }

  static isPlatform(
    layer: KnowledgeLayer.Layer,
  ): layer is KnowledgeLayer.Platform {
    return layer !== "shared" && layer !== "product";
  }
}
