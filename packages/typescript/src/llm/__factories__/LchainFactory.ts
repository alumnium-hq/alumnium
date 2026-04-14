import type { Generation } from "@langchain/core/outputs";
import { merge } from "ts-deepmerge";
import type { TypeUtils } from "../../typeUtils.ts";
import { Lchain } from "../Lchain.ts";
import { LchainSchema } from "../LchainSchema.ts";

export namespace LchainFactory {
  export interface StoredGenerationWithProps {
    text?: string | undefined;
    toolCalls?: LchainSchema.ToolCall[] | undefined;
    usage?: LchainSchema.UsageMetadata | undefined;
    content?: LchainSchema.MessageContent[] | undefined;
  }
}

export abstract class LchainFactory {
  static toolCall(
    overrides?: Partial<LchainSchema.ToolCall>,
  ): LchainSchema.ToolCall {
    return {
      id: "call-id",
      type: "tool_call" as const,
      name: "ClickTool",
      args: { id: 42 },
      ...overrides,
    };
  }

  static googleFunctionCall(
    overrides?: Partial<LchainSchema.MessageFunctionCallData>,
  ) {
    return {
      id: "call-id",
      name: "ClickTool",
      args: { id: 42 },
      ...overrides,
    };
  }

  static storedGeneration(
    overrides?:
      | TypeUtils.DeepPartial<LchainSchema.StoredGeneration>
      | undefined,
  ): LchainSchema.StoredGeneration {
    const text = overrides?.text ?? "";
    const content = overrides?.message?.data?.content ?? text;
    return this.#merge<LchainSchema.StoredGeneration>(
      {
        text,
        message: {
          type: "ai",
          data: {
            id: "gen-id",
            content,
            tool_calls: [],
            invalid_tool_calls: [],
            usage_metadata: {
              input_tokens: 1,
              output_tokens: 2,
              total_tokens: 3,
            },
            response_metadata: {},
            additional_kwargs: {},
          },
        },
      },
      overrides || {},
    );
  }

  static generation(
    overrides?: TypeUtils.DeepPartial<LchainSchema.StoredGeneration>,
  ): Generation {
    return Lchain.fromStored(this.storedGeneration(overrides));
  }

  static storedGenerationWith(
    props: LchainFactory.StoredGenerationWithProps,
  ): LchainSchema.StoredGeneration {
    const { text, content, toolCalls, usage } = props;
    let overrides: TypeUtils.DeepPartial<LchainSchema.StoredGeneration> = {};

    if (text) overrides = this.#merge(overrides, { text });

    if (content)
      overrides = this.#merge(overrides, { message: { data: { content } } });

    if (toolCalls)
      overrides = this.#merge(overrides, {
        message: { data: { tool_calls: toolCalls } },
      });

    if (usage)
      overrides = this.#merge(overrides, {
        message: { data: { usage_metadata: usage } },
      });

    return this.storedGeneration(overrides);
  }

  static generationWith(
    props: LchainFactory.StoredGenerationWithProps,
  ): Generation {
    return Lchain.fromStored(this.storedGenerationWith(props));
  }

  static #merge<Type>(base: Type, ...objects: unknown[]): Type {
    return merge.withOptions(
      { mergeArrays: false },
      this.#mergeArg(base),
      ...objects.map(this.#mergeArg),
    ) as Type;
  }

  static #mergeArg(this: void, object: unknown): object {
    return object && typeof object === "object" ? object : {};
  }
}
