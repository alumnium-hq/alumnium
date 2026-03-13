import { describe, expect, it } from "bun:test";
import { LchainFactory } from "../../../llm/__factories__/LchainFactory.js";
import { ElementsCacheMask } from "./ElementsCacheMask.js";

describe("ElementsCacheMask", () => {
  describe("mask", () => {
    it("masks ids in tool_calls args", () => {
      const generation = LchainFactory.storedGenerationWith({
        toolCalls: [
          LchainFactory.toolCall({
            args: {
              id: 5,
            },
          }),
          LchainFactory.toolCall({
            name: "DragAndDropTool",
            args: {
              from_id: 10,
              to_id: 5,
            },
          }),
          LchainFactory.toolCall({
            name: "RandomTool",
            args: {
              uid: "123",
              value: 456,
            },
          }),
        ],
      });

      const masked = ElementsCacheMask.mask(generation, [5, 10]);

      expect(masked.message?.data.tool_calls).toEqual([
        expect.objectContaining({
          args: {
            id: "<MASKED_0>",
          },
        }),
        expect.objectContaining({
          args: {
            from_id: "<MASKED_1>",
            to_id: "<MASKED_0>",
          },
        }),
        expect.objectContaining({
          args: {
            uid: "123",
            value: 456,
          },
        }),
      ]);
    });

    it("returns the same generation when element ids are empty", () => {
      const generation = LchainFactory.storedGenerationWith({
        toolCalls: [
          {
            name: "ClickTool",
            args: {
              id: 5,
            },
          },
        ],
      });

      const masked = ElementsCacheMask.mask(generation, []);

      expect(masked).toEqual(generation);
    });

    // TODO: Figure out if function_call masking is needed in LangChain JS.

    it.todo("masks ids in content function_call arguments", () => {});

    it.todo("masks ids in additional_kwargs tool_calls arguments", () => {});
  });

  describe("unmask", () => {
    it("unmasks ids in tool_calls args", () => {
      const generation = LchainFactory.storedGenerationWith({
        toolCalls: [
          {
            name: "ClickTool",
            args: {
              id: "<MASKED_0>",
            },
          },
          {
            name: "DragAndDropTool",
            args: {
              from_id: "<MASKED_1>",
              to_id: "<MASKED_0>",
            },
          },
          {
            name: "RandomTool",
            args: {
              uid: "123",
              value: 456,
            },
          },
        ],
      });

      const unmasked = ElementsCacheMask.unmask(generation, {
        0: 42,
        1: 99,
      });

      expect(unmasked.message?.data.tool_calls).toEqual([
        {
          name: "ClickTool",
          args: {
            id: 42,
          },
        },
        {
          name: "DragAndDropTool",
          args: {
            from_id: 99,
            to_id: 42,
          },
        },
        {
          name: "RandomTool",
          args: {
            uid: "123",
            value: 456,
          },
        },
      ]);
    });

    it("returns the same generation when mapping is empty", () => {
      const generation = LchainFactory.storedGenerationWith({
        toolCalls: [
          {
            name: "ClickTool",
            args: {
              id: "<MASKED_5>",
            },
          },
        ],
      });

      const unmasked = ElementsCacheMask.unmask(generation, {});

      expect(unmasked).toEqual(generation);
    });

    it("supports mask/unmask roundtrip for tool calls", () => {
      const generation = LchainFactory.storedGenerationWith({
        toolCalls: [
          { name: "ClickTool", args: { id: 5 } },
          { name: "TypeTool", args: { id: 10, text: "hello" } },
          {
            name: "DragAndDropTool",
            args: {
              from_id: 5,
              to_id: 10,
            },
          },
        ],
      });

      const masked = ElementsCacheMask.mask(generation, [5, 10]);
      const unmasked = ElementsCacheMask.unmask(masked, { 0: 5, 1: 10 });

      expect(unmasked).toEqual(generation);
    });

    it("supports unmasking with remapped ids", () => {
      const generation = LchainFactory.storedGenerationWith({
        toolCalls: [{ name: "ClickTool", args: { id: "<MASKED_0>" } }],
      });

      const unmasked = ElementsCacheMask.unmask(generation, { 0: 42 });

      expect(unmasked).toEqual(
        LchainFactory.storedGenerationWith({
          toolCalls: [{ name: "ClickTool", args: { id: 42 } }],
        }),
      );
    });
  });
});
