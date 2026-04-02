import { describe, expect, it } from "vitest";
import { LchainFactory } from "../../../llm/__factories__/LchainFactory.ts";
import { ElementsCacheMask } from "./ElementsCacheMask.ts";

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

    it("masks ids in Google messages", () => {
      const generation = LchainFactory.storedGenerationWith({
        content: [
          { type: "thinking", thinking: "Hmm..." },
          {
            type: "functionCall",
            functionCall: LchainFactory.googleFunctionCall({
              args: {
                id: 5,
              },
            }),
          },
          {
            type: "functionCall",
            functionCall: LchainFactory.googleFunctionCall({
              name: "DragAndDropTool",
              args: {
                from_id: 10,
                to_id: 5,
              },
            }),
          },
          {
            type: "functionCall",
            functionCall: LchainFactory.googleFunctionCall({
              name: "RandomTool",
              args: {
                uid: "123",
                value: 456,
              },
            }),
          },
        ],
      });

      const masked = ElementsCacheMask.mask(generation, [5, 10]);

      expect(masked.message?.data.content).toEqual([
        expect.objectContaining({ thinking: "Hmm..." }),
        expect.objectContaining({
          functionCall: expect.objectContaining({
            args: {
              id: "<MASKED_0>",
            },
          }),
        }),
        expect.objectContaining({
          functionCall: expect.objectContaining({
            args: {
              from_id: "<MASKED_1>",
              to_id: "<MASKED_0>",
            },
          }),
        }),
        expect.objectContaining({
          functionCall: expect.objectContaining({
            args: {
              uid: "123",
              value: 456,
            },
          }),
        }),
      ]);
    });

    it("masks ids in Anthropic messages", () => {
      const generation = LchainFactory.storedGenerationWith({
        content: [
          { type: "thinking", thinking: "Hmm..." },
          {
            type: "tool_use",
            id: "tool-use-id",
            name: "ClickTool",
            input: { id: 5 },
            caller: {},
          },
          {
            type: "tool_use",
            id: "tool-use-id",
            name: "ClickTool",
            input: { from_id: 10, to_id: 5 },
            caller: {},
          },
          {
            type: "tool_use",
            id: "tool-use-id-",
            name: "ClickTool",
            input: {
              uid: "123",
              value: 456,
            },
            caller: {},
          },
        ],
      });

      const masked = ElementsCacheMask.mask(generation, [5, 10]);

      expect(masked.message?.data.content).toEqual([
        expect.objectContaining({ thinking: "Hmm..." }),
        expect.objectContaining({
          input: {
            id: "<MASKED_0>",
          },
        }),
        expect.objectContaining({
          input: {
            from_id: "<MASKED_1>",
            to_id: "<MASKED_0>",
          },
        }),
        expect.objectContaining({
          input: {
            uid: "123",
            value: 456,
          },
        }),
      ]);
    });

    it("returns the same generation when element ids are empty", () => {
      const generation = LchainFactory.storedGenerationWith({
        toolCalls: [
          LchainFactory.toolCall({
            args: {
              id: 5,
            },
          }),
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
          LchainFactory.toolCall({
            name: "ClickTool",
            args: {
              id: "<MASKED_0>",
            },
          }),
          LchainFactory.toolCall({
            name: "DragAndDropTool",
            args: {
              from_id: "<MASKED_1>",
              to_id: "<MASKED_0>",
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

      const unmasked = ElementsCacheMask.unmask(generation, {
        0: 42,
        1: 99,
      });

      expect(unmasked.message?.data.tool_calls).toEqual([
        expect.objectContaining({
          name: "ClickTool",
          args: {
            id: 42,
          },
        }),
        expect.objectContaining({
          name: "DragAndDropTool",
          args: {
            from_id: 99,
            to_id: 42,
          },
        }),
        expect.objectContaining({
          name: "RandomTool",
          args: {
            uid: "123",
            value: 456,
          },
        }),
      ]);
    });

    it("unmasks ids in Google messages", () => {
      const generation = LchainFactory.storedGenerationWith({
        content: [
          { type: "thinking", thinking: "Hmm..." },
          {
            type: "functionCall",
            functionCall: LchainFactory.googleFunctionCall({
              args: {
                id: "<MASKED_0>",
              },
            }),
          },
          {
            type: "functionCall",
            functionCall: LchainFactory.googleFunctionCall({
              name: "DragAndDropTool",
              args: {
                from_id: "<MASKED_1>",
                to_id: "<MASKED_0>",
              },
            }),
          },
          {
            type: "functionCall",
            functionCall: LchainFactory.googleFunctionCall({
              name: "RandomTool",
              args: {
                uid: "123",
                value: 456,
              },
            }),
          },
        ],
      });

      const unmasked = ElementsCacheMask.unmask(generation, {
        0: 42,
        1: 99,
      });

      expect(unmasked.message?.data.content).toEqual([
        expect.objectContaining({ thinking: "Hmm..." }),
        expect.objectContaining({
          functionCall: expect.objectContaining({
            args: {
              id: 42,
            },
          }),
        }),
        expect.objectContaining({
          functionCall: expect.objectContaining({
            args: {
              from_id: 99,
              to_id: 42,
            },
          }),
        }),
        expect.objectContaining({
          functionCall: expect.objectContaining({
            args: {
              uid: "123",
              value: 456,
            },
          }),
        }),
      ]);
    });

    it("unmasks ids in Anthropic messages", () => {
      const generation = LchainFactory.storedGenerationWith({
        content: [
          { type: "thinking", thinking: "Hmm..." },
          {
            type: "tool_use",
            id: "tool-use-id",
            name: "ClickTool",
            input: { id: "<MASKED_0>" },
            caller: {},
          },
          {
            type: "tool_use",
            id: "tool-use-id",
            name: "ClickTool",
            input: {
              from_id: "<MASKED_1>",
              to_id: "<MASKED_0>",
            },
            caller: {},
          },
          {
            type: "tool_use",
            id: "tool-use-id",
            name: "RandomTool",
            input: {
              uid: "123",
              value: 456,
            },
            caller: {},
          },
        ],
      });

      const unmasked = ElementsCacheMask.unmask(generation, {
        0: 42,
        1: 99,
      });

      expect(unmasked.message?.data.content).toEqual([
        expect.objectContaining({ thinking: "Hmm..." }),
        expect.objectContaining({
          input: {
            id: 42,
          },
        }),
        expect.objectContaining({
          input: {
            from_id: 99,
            to_id: 42,
          },
        }),
        expect.objectContaining({
          input: {
            uid: "123",
            value: 456,
          },
        }),
      ]);
    });

    it("returns the same generation when mapping is empty", () => {
      const generation = LchainFactory.storedGenerationWith({
        toolCalls: [
          LchainFactory.toolCall({
            name: "ClickTool",
            args: {
              id: "<MASKED_5>",
            },
          }),
        ],
      });

      const unmasked = ElementsCacheMask.unmask(generation, {});

      expect(unmasked).toEqual(generation);
    });

    it("supports mask/unmask roundtrip for tool calls", () => {
      const generation = LchainFactory.storedGenerationWith({
        toolCalls: [
          LchainFactory.toolCall({ name: "ClickTool", args: { id: 5 } }),
          LchainFactory.toolCall({
            name: "TypeTool",
            args: { id: 10, text: "hello" },
          }),
          LchainFactory.toolCall({
            name: "DragAndDropTool",
            args: {
              from_id: 5,
              to_id: 10,
            },
          }),
        ],
      });

      const masked = ElementsCacheMask.mask(generation, [5, 10]);
      const unmasked = ElementsCacheMask.unmask(masked, { 0: 5, 1: 10 });

      expect(unmasked).toEqual(generation);
    });

    it("supports unmasking with remapped ids", () => {
      const generation = LchainFactory.storedGenerationWith({
        toolCalls: [
          LchainFactory.toolCall({
            name: "ClickTool",
            args: { id: "<MASKED_0>" },
          }),
        ],
      });

      const unmasked = ElementsCacheMask.unmask(generation, { 0: 42 });

      expect(unmasked).toEqual(
        LchainFactory.storedGenerationWith({
          toolCalls: [
            LchainFactory.toolCall({ name: "ClickTool", args: { id: 42 } }),
          ],
        }),
      );
    });
  });
});
