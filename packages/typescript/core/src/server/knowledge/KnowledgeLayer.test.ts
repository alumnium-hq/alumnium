import { describe, expect, it } from "vitest";
import { KnowledgeLayer } from "./KnowledgeLayer.ts";

describe(KnowledgeLayer, () => {
  describe("platform", () => {
    it.each([
      ["chromium", "web"],
      ["firefox", "web"],
      ["ios", "ios"],
      ["android", "android"],
    ] as const)("maps %s sessions to the %s layer", (platform, layer) => {
      expect(KnowledgeLayer.platform(platform)).toBe(layer);
    });
  });
});
