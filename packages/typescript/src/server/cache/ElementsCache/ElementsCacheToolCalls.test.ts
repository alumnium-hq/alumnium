import { describe, expect, it } from "vitest";
import { LchainFactory } from "../../../llm/__factories__/LchainFactory.ts";
import { ElementsCacheToolCalls } from "./ElementsCacheToolCalls.ts";

describe("ElementsCacheToolCalls", () => {
  describe("extractElementIds", () => {
    it("extracts element ids in order from tool calls", () => {
      const generation = LchainFactory.storedGenerationWith({
        toolCalls: [
          { name: "ClickTool", args: { id: 4 } },
          { name: "TypeTool", args: { id: 3, text: "hello" } },
          { name: "DragAndDropTool", args: { from_id: 1, to_id: 2 } },
        ],
      });

      expect(ElementsCacheToolCalls.extractElementIds(generation)).toEqual([
        4, 3, 1, 2,
      ]);
    });

    it("deduplicates extracted element ids preserving first appearance", () => {
      const generation = LchainFactory.storedGenerationWith({
        toolCalls: [
          { name: "ClickTool", args: { id: 3 } },
          { name: "TypeTool", args: { id: 1 } },
          { name: "ClickTool", args: { id: 3 } },
        ],
      });

      expect(ElementsCacheToolCalls.extractElementIds(generation)).toEqual([
        3, 1,
      ]);
    });
  });
});
