import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { describe, expect, it } from "vitest";
import { AiSdk } from "../../../llm/AiSdk.ts";
import { AiSdkFactory } from "../../../llm/__factories__/AiSdkFactory.ts";
import { ElementsCacheMask } from "./ElementsCacheMask.ts";

describe("ElementsCacheMask", () => {
  describe("mask", () => {
    it("masks ids in tool-call inputs", () => {
      const generation = AiSdkFactory.generateResult({
        toolCalls: [
          AiSdkFactory.toolCall({ args: { id: 5 } }),
          AiSdkFactory.toolCall({
            name: "DragAndDropTool",
            args: { from_id: 10, to_id: 5 },
          }),
          AiSdkFactory.toolCall({
            name: "RandomTool",
            args: { uid: "123", value: 456 },
          }),
        ],
      });

      const masked = ElementsCacheMask.mask(generation, [5, 10]);

      expect(toolCallInputs(masked)).toEqual([
        { id: "<MASKED_0>" },
        { from_id: "<MASKED_1>", to_id: "<MASKED_0>" },
        { uid: "123", value: 456 },
      ]);
    });

    it("masks ids in canonical tool calls adapted from Google messages", () => {
      const generation = AiSdkFactory.generateResult({
        text: "Hmm...",
        toolCalls: [
          AiSdkFactory.toolCall({ args: { id: 5 } }),
          AiSdkFactory.toolCall({
            name: "DragAndDropTool",
            args: { from_id: 10, to_id: 5 },
          }),
          AiSdkFactory.toolCall({
            name: "RandomTool",
            args: { uid: "123", value: 456 },
          }),
        ],
      });

      const masked = ElementsCacheMask.mask(generation, [5, 10]);

      expect(masked!.content[0]).toEqual({ type: "text", text: "Hmm..." });
      expect(toolCallInputs(masked)).toEqual([
        { id: "<MASKED_0>" },
        { from_id: "<MASKED_1>", to_id: "<MASKED_0>" },
        { uid: "123", value: 456 },
      ]);
    });

    it("masks ids in canonical tool calls adapted from Anthropic messages", () => {
      const generation = AiSdkFactory.generateResult({
        text: "Hmm...",
        toolCalls: [
          AiSdkFactory.toolCall({
            id: "tool-use-id",
            name: "ClickTool",
            args: { id: 5 },
          }),
          AiSdkFactory.toolCall({
            id: "tool-use-id",
            name: "ClickTool",
            args: { from_id: 10, to_id: 5 },
          }),
          AiSdkFactory.toolCall({
            id: "tool-use-id-2",
            name: "ClickTool",
            args: { uid: "123", value: 456 },
          }),
        ],
      });

      const masked = ElementsCacheMask.mask(generation, [5, 10]);

      expect(masked!.content[0]).toEqual({ type: "text", text: "Hmm..." });
      expect(toolCallInputs(masked)).toEqual([
        { id: "<MASKED_0>" },
        { from_id: "<MASKED_1>", to_id: "<MASKED_0>" },
        { uid: "123", value: 456 },
      ]);
    });

    it("returns an equal clone when element ids are empty", () => {
      const generation = AiSdkFactory.generateResult({
        toolCalls: [AiSdkFactory.toolCall({ args: { id: 5 } })],
      });

      const masked = ElementsCacheMask.mask(generation, []);

      expect(masked).toEqual(generation);
      expect(masked).not.toBe(generation);
    });

    it("masks canonical inputs instead of legacy content function calls", () => {
      const generation = AiSdkFactory.generateResult({
        toolCalls: [
          AiSdkFactory.toolCall({ input: JSON.stringify({ id: 5 }) }),
        ],
      });

      const masked = ElementsCacheMask.mask(generation, [5]);

      expect(toolCallInputs(masked)).toEqual([{ id: "<MASKED_0>" }]);
    });

    it("masks canonical inputs instead of legacy additional tool calls", () => {
      const generation = AiSdkFactory.generateResult({
        toolCalls: [
          AiSdkFactory.toolCall({
            input: JSON.stringify({ from_id: 10, to_id: 5 }),
          }),
        ],
      });

      const masked = ElementsCacheMask.mask(generation, [5, 10]);

      expect(toolCallInputs(masked)).toEqual([
        { from_id: "<MASKED_1>", to_id: "<MASKED_0>" },
      ]);
    });

    it("does not change non-tool content or unrelated input fields", () => {
      const generation = AiSdkFactory.generateResult({
        text: "reasoning preserved",
        toolCalls: [
          AiSdkFactory.toolCall({
            name: "DragAndDropTool",
            args: { from_id: 10, to_id: 5, label: "preserved" },
          }),
        ],
      });

      const masked = ElementsCacheMask.mask(generation, [5, 10]);

      expect(masked!.content[0]).toEqual(generation.content[0]);
      expect(toolCallInputs(masked)).toEqual([
        {
          from_id: "<MASKED_1>",
          to_id: "<MASKED_0>",
          label: "preserved",
        },
      ]);
    });

    it("preserves empty, non-object, and unrelated inputs byte-for-byte", () => {
      const inputs = [
        "",
        "[]",
        "null",
        '"unusual string"',
        "42",
        '{  "value" : 456, "uid": "123" }',
      ];
      const generation = AiSdkFactory.generateResult({
        toolCalls: inputs.map((input) => AiSdkFactory.toolCall({ input })),
      });

      const masked = ElementsCacheMask.mask(generation, [5]);

      expect(masked).not.toBeNull();
      expect(AiSdk.toolCalls(masked!).map((call) => call.input)).toEqual(
        inputs,
      );
    });

    it("masks a valid call followed by an empty argument-less call", () => {
      const generation = AiSdkFactory.generateResult({
        toolCalls: [
          AiSdkFactory.toolCall({ args: { id: 5 } }),
          AiSdkFactory.toolCall({ name: "ArgumentlessTool", input: "" }),
        ],
      });

      const masked = ElementsCacheMask.mask(generation, [5]);

      expect(AiSdk.toolCalls(masked!).map((call) => call.input)).toEqual([
        '{"id":"<MASKED_0>"}',
        "",
      ]);
    });

    it("returns null atomically when a later input is malformed", () => {
      const generation = AiSdkFactory.generateResult({
        toolCalls: [
          AiSdkFactory.toolCall({ args: { id: 5 } }),
          AiSdkFactory.toolCall({ input: "{" }),
        ],
      });

      expect(ElementsCacheMask.mask(generation, [5])).toBeNull();
      expect(AiSdk.toolCalls(generation)[0]?.input).toBe('{"id":5}');
    });
  });

  describe("unmask", () => {
    it("unmasks ids in tool-call inputs", () => {
      const generation = AiSdkFactory.generateResult({
        toolCalls: [
          AiSdkFactory.toolCall({
            name: "ClickTool",
            args: { id: "<MASKED_0>" },
          }),
          AiSdkFactory.toolCall({
            name: "DragAndDropTool",
            args: { from_id: "<MASKED_1>", to_id: "<MASKED_0>" },
          }),
          AiSdkFactory.toolCall({
            name: "RandomTool",
            args: { uid: "123", value: 456 },
          }),
        ],
      });

      const unmasked = ElementsCacheMask.unmask(generation, { 0: 42, 1: 99 });

      expect(toolCallInputs(unmasked)).toEqual([
        { id: 42 },
        { from_id: 99, to_id: 42 },
        { uid: "123", value: 456 },
      ]);
    });

    it("unmasks ids in canonical tool calls adapted from Google messages", () => {
      const generation = AiSdkFactory.generateResult({
        text: "Hmm...",
        toolCalls: [
          AiSdkFactory.toolCall({ args: { id: "<MASKED_0>" } }),
          AiSdkFactory.toolCall({
            name: "DragAndDropTool",
            args: { from_id: "<MASKED_1>", to_id: "<MASKED_0>" },
          }),
          AiSdkFactory.toolCall({
            name: "RandomTool",
            args: { uid: "123", value: 456 },
          }),
        ],
      });

      const unmasked = ElementsCacheMask.unmask(generation, { 0: 42, 1: 99 });

      expect(unmasked!.content[0]).toEqual({ type: "text", text: "Hmm..." });
      expect(toolCallInputs(unmasked)).toEqual([
        { id: 42 },
        { from_id: 99, to_id: 42 },
        { uid: "123", value: 456 },
      ]);
    });

    it("unmasks ids in canonical tool calls adapted from Anthropic messages", () => {
      const generation = AiSdkFactory.generateResult({
        text: "Hmm...",
        toolCalls: [
          AiSdkFactory.toolCall({
            id: "tool-use-id",
            name: "ClickTool",
            args: { id: "<MASKED_0>" },
          }),
          AiSdkFactory.toolCall({
            id: "tool-use-id",
            name: "ClickTool",
            args: { from_id: "<MASKED_1>", to_id: "<MASKED_0>" },
          }),
          AiSdkFactory.toolCall({
            id: "tool-use-id-2",
            name: "RandomTool",
            args: { uid: "123", value: 456 },
          }),
        ],
      });

      const unmasked = ElementsCacheMask.unmask(generation, { 0: 42, 1: 99 });

      expect(unmasked!.content[0]).toEqual({ type: "text", text: "Hmm..." });
      expect(toolCallInputs(unmasked)).toEqual([
        { id: 42 },
        { from_id: 99, to_id: 42 },
        { uid: "123", value: 456 },
      ]);
    });

    it("rejects an unresolved mask when mapping is empty", () => {
      const generation = AiSdkFactory.generateResult({
        toolCalls: [AiSdkFactory.toolCall({ args: { id: "<MASKED_5>" } })],
      });

      const unmasked = ElementsCacheMask.unmask(generation, {});

      expect(unmasked).toBeNull();
    });

    it("supports mask/unmask roundtrip for tool calls", () => {
      const generation = AiSdkFactory.generateResult({
        toolCalls: [
          AiSdkFactory.toolCall({ name: "ClickTool", args: { id: 5 } }),
          AiSdkFactory.toolCall({
            name: "TypeTool",
            args: { id: 10, text: "hello" },
          }),
          AiSdkFactory.toolCall({
            name: "DragAndDropTool",
            args: { from_id: 5, to_id: 10 },
          }),
        ],
      });

      const masked = ElementsCacheMask.mask(generation, [5, 10]);
      const unmasked = ElementsCacheMask.unmask(masked!, { 0: 5, 1: 10 });

      expect(unmasked).toEqual(generation);
    });

    it("supports unmasking with remapped ids", () => {
      const generation = AiSdkFactory.generateResult({
        toolCalls: [
          AiSdkFactory.toolCall({
            name: "ClickTool",
            args: { id: "<MASKED_0>" },
          }),
        ],
      });

      const unmasked = ElementsCacheMask.unmask(generation, { 0: 42 });

      expect(unmasked).toEqual(
        AiSdkFactory.generateResult({
          toolCalls: [
            AiSdkFactory.toolCall({ name: "ClickTool", args: { id: 42 } }),
          ],
        }),
      );
    });

    it("preserves unusual inputs while unmasking another call", () => {
      const inputs = ["", "[]", "null", '"value"', "42", '{ "uid": 1 }'];
      const generation = AiSdkFactory.generateResult({
        toolCalls: [
          AiSdkFactory.toolCall({ args: { id: "<MASKED_0>" } }),
          ...inputs.map((input) => AiSdkFactory.toolCall({ input })),
        ],
      });

      const unmasked = ElementsCacheMask.unmask(generation, { 0: 5 });

      expect(AiSdk.toolCalls(unmasked!).map((call) => call.input)).toEqual([
        '{"id":5}',
        ...inputs,
      ]);
    });

    it("returns null atomically for a malformed cached input", () => {
      const generation = AiSdkFactory.generateResult({
        toolCalls: [
          AiSdkFactory.toolCall({ args: { id: "<MASKED_0>" } }),
          AiSdkFactory.toolCall({ input: "{" }),
        ],
      });

      expect(ElementsCacheMask.unmask(generation, { 0: 5 })).toBeNull();
      expect(AiSdk.toolCalls(generation)[0]?.input).toBe('{"id":"<MASKED_0>"}');
    });
  });
});

function toolCallInputs(
  generation: LanguageModelV4GenerateResult | null,
): Record<string, unknown>[] {
  if (!generation) throw new Error("Expected transformed generation");
  return AiSdk.toolCalls(generation).map((toolCall) => {
    const input = AiSdk.toolCallInput(toolCall);
    if (input.kind !== "object") throw new Error("Expected object tool input");
    return input.value;
  });
}
