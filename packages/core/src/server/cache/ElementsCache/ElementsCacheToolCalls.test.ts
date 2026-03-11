import { describe, expect, it } from "bun:test";
import type { Lchain } from "../../../llm/Lchain.js";
import { ElementsCacheToolCalls } from "./ElementsCacheToolCalls.js";

describe("ElementsCacheToolCalls", () => {
  describe("extractElementIds", () => {
    it("extracts element ids in order from tool calls", () => {
      const generation: Lchain.Generation = {
        text: "",
        message: {
          type: "ai",
          content: "",
          tool_calls: [
            { name: "ClickTool", args: { id: 4 } },
            { name: "TypeTool", args: { id: 3, text: "hello" } },
            { name: "DragAndDropTool", args: { from_id: 1, to_id: 2 } },
          ],
        },
      };

      expect(ElementsCacheToolCalls.extractElementIds(generation)).toEqual([
        4, 3, 1, 2,
      ]);
    });

    it("deduplicates extracted element ids preserving first appearance", () => {
      const generation: Lchain.Generation = {
        text: "",
        message: {
          type: "ai",
          content: "",
          tool_calls: [
            { name: "ClickTool", args: { id: 3 } },
            { name: "TypeTool", args: { id: 1 } },
            { name: "ClickTool", args: { id: 3 } },
          ],
        },
      };

      expect(ElementsCacheToolCalls.extractElementIds(generation)).toEqual([
        3, 1,
      ]);
    });
  });
});
