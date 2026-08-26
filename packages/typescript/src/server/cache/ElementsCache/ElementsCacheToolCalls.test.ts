import { describe, expect, it } from "vitest";
import { AiSdkFactory } from "../../../llm/__factories__/AiSdkFactory.ts";
import { ElementsCacheToolCalls } from "./ElementsCacheToolCalls.ts";

describe("ElementsCacheToolCalls", () => {
  describe("extractElementIds", () => {
    it("extracts element ids in order from tool calls", () => {
      const generation = AiSdkFactory.generateResult({
        toolCalls: [
          AiSdkFactory.toolCall({ name: "ClickTool", args: { id: 4 } }),
          AiSdkFactory.toolCall({
            name: "TypeTool",
            args: { id: 3, text: "hello" },
          }),
          AiSdkFactory.toolCall({
            name: "DragAndDropTool",
            args: { from_id: 1, to_id: 2 },
          }),
        ],
      });

      expect(ElementsCacheToolCalls.extractElementIds(generation)).toEqual([
        4, 3, 1, 2,
      ]);
    });

    it("deduplicates extracted element ids preserving first appearance", () => {
      const generation = AiSdkFactory.generateResult({
        toolCalls: [
          AiSdkFactory.toolCall({ name: "ClickTool", args: { id: 3 } }),
          AiSdkFactory.toolCall({ name: "TypeTool", args: { id: 1 } }),
          AiSdkFactory.toolCall({ name: "ClickTool", args: { id: 3 } }),
        ],
      });

      expect(ElementsCacheToolCalls.extractElementIds(generation)).toEqual([
        3, 1,
      ]);
    });

    it("extracts each call independently around empty and malformed inputs", () => {
      const generation = AiSdkFactory.generateResult({
        toolCalls: [
          AiSdkFactory.toolCall({ args: { id: 4 } }),
          AiSdkFactory.toolCall({ input: "" }),
          AiSdkFactory.toolCall({ input: "{" }),
          AiSdkFactory.toolCall({ args: { from_id: 1, to_id: 2 } }),
        ],
      });

      expect(ElementsCacheToolCalls.extractElementIds(generation)).toEqual([
        4, 1, 2,
      ]);
    });
  });
});
