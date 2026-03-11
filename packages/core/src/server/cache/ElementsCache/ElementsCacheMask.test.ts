import { describe, expect, it } from "bun:test";
import type { Lchain } from "../../../llm/Lchain.js";
import { ElementsCacheMask } from "./ElementsCacheMask.js";

describe("ElementsCacheMask", () => {
  describe("mask", () => {
    it("masks ids in tool_calls args", () => {
      const generation = createGeneration({
        tool_calls: [
          createToolCall("ClickTool", {
            id: 5,
          }),
          createToolCall("DragAndDropTool", {
            from_id: 10,
            to_id: 5,
          }),
          createToolCall("RandomTool", {
            uid: "123",
            value: 456,
          }),
        ],
      });

      const masked = ElementsCacheMask.mask(generation, [5, 10]);

      expect(masked.message?.data.tool_calls).toEqual([
        createToolCall("ClickTool", {
          id: "<MASKED_0>",
        }),
        createToolCall("DragAndDropTool", {
          from_id: "<MASKED_1>",
          to_id: "<MASKED_0>",
        }),
        createToolCall("RandomTool", {
          uid: "123",
          value: 456,
        }),
      ]);
    });

    it("returns the same generation when element ids are empty", () => {
      const generation = createGeneration({
        tool_calls: [
          createToolCall("ClickTool", {
            id: 5,
          }),
        ],
      });

      const masked = ElementsCacheMask.mask(generation, []);

      expect(masked).toEqual(generation);
    });
  });

  describe("unmask", () => {
    it("unmasks ids in tool_calls args", () => {
      const generation = createGeneration({
        tool_calls: [
          createToolCall("ClickTool", {
            id: "<MASKED_0>",
          }),
          createToolCall("DragAndDropTool", {
            from_id: "<MASKED_1>",
            to_id: "<MASKED_0>",
          }),
          createToolCall("RandomTool", {
            uid: "123",
            value: 456,
          }),
        ],
      });

      const unmasked = ElementsCacheMask.unmask(generation, {
        0: 42,
        1: 99,
      });

      expect(unmasked.message?.data.tool_calls).toEqual([
        createToolCall("ClickTool", {
          id: 42,
        }),
        createToolCall("DragAndDropTool", {
          from_id: 99,
          to_id: 42,
        }),
        createToolCall("RandomTool", {
          uid: "123",
          value: 456,
        }),
      ]);
    });

    it("returns the same generation when mapping is empty", () => {
      const generation = createGeneration({
        tool_calls: [
          createToolCall("ClickTool", {
            id: "<MASKED_5>",
          }),
        ],
      });

      expect(ElementsCacheMask.unmask(generation, {})).toEqual(generation);
    });
  });
});

function createGeneration(
  data: Partial<Lchain.StoredMessageData>,
): Lchain.StoredGeneration {
  return {
    text: "",
    message: {
      type: "ai",
      data: {
        content: "",
        additional_kwargs: {},
        response_metadata: {},
        ...data,
      },
    },
  };
}

function createToolCall(
  name: string,
  args: Record<string, unknown>,
): Lchain.ToolCall {
  return {
    name,
    args,
  };
}
