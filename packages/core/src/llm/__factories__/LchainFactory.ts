import type { Generation } from "@langchain/core/outputs";
import { merge } from "ts-deepmerge";
import type { TypeUtils } from "../../typeUtils.js";
import { Lchain } from "../Lchain.js";

export namespace LchainFactory {
  export interface StoredGenerationWithProps {
    text?: string | undefined;
    toolCalls?: Lchain.ToolCall[] | undefined;
    usage?: Lchain.UsageMetadata | undefined;
  }
}

export abstract class LchainFactory {
  static toolCall(overrides?: Partial<Lchain.ToolCall>) {
    return {
      name: "ClickTool",
      args: { id: 42 },
      ...overrides,
    };
  }

  static storedGeneration(
    overrides?: TypeUtils.DeepPartial<Lchain.StoredGeneration> | undefined,
  ): Lchain.StoredGeneration {
    const text = overrides?.text ?? "";
    return this.#merge(
      {
        text,
        message: {
          type: "ai",
          data: {
            content: text,
            tool_calls: [],
            invalid_tool_calls: [],
            additional_kwargs: {},
            response_metadata: {},
          },
        },
      },
      overrides || {},
    );
  }

  static generation(
    overrides?: TypeUtils.DeepPartial<Lchain.StoredGeneration>,
  ): Generation {
    return Lchain.fromStored(this.storedGeneration(overrides));
  }

  static storedGenerationWith(
    props: LchainFactory.StoredGenerationWithProps,
  ): Lchain.StoredGeneration {
    const { text, toolCalls, usage } = props;
    let overrides: TypeUtils.DeepPartial<Lchain.StoredGeneration> = {};

    if (text) overrides = this.#merge(overrides, { text });

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
