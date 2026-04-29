import {
  deserializeStoredGeneration,
  serializeGeneration,
} from "@langchain/core/caches";
import type { AIMessage, StoredGeneration } from "@langchain/core/messages";
import type { Generation } from "@langchain/core/outputs";
import { logSchemaParseError } from "../utils/logFormat.ts";
import { scanTypes } from "../utils/typesScan.ts";
import { LchainSchema } from "./LchainSchema.ts";
import type { LlmUsage } from "./llmSchema.ts";

export abstract class Lchain {
  static toStored(
    this: void,
    generation: Generation,
  ): LchainSchema.StoredGeneration {
    const stored = serializeGeneration(generation);
    scanTypes({
      url: import.meta.url,
      id: "serialized",
      value: stored,
    });
    const result = LchainSchema.StoredGeneration.safeParse(stored);
    if (!result.success) {
      const message = logSchemaParseError(
        "stored generation",
        generation,
        result,
      );
      throw new Error(
        `Failed to serialize generation to stored format: ${message}`,
      );
    }
    return result.data;
  }

  static fromStored(stored: LchainSchema.StoredGeneration): Generation {
    return deserializeStoredGeneration(stored as unknown as StoredGeneration);
  }

  static applyUsage(
    usage: LlmUsage,
    usageMetadata: LchainSchema.UsageMetadata,
  ) {
    usage.cache_creation +=
      usageMetadata.input_token_details?.cache_creation ?? 0;
    usage.cache_read += usageMetadata.input_token_details?.cache_read ?? 0;
    usage.reasoning += usageMetadata.output_token_details?.reasoning ?? 0;
    usage.input_tokens += usageMetadata.input_tokens ?? 0;
    usage.output_tokens += usageMetadata.output_tokens ?? 0;
    usage.total_tokens += usageMetadata.total_tokens ?? 0;
  }
}

export namespace Lchain {
  export type InvokeResult = AIMessage | InvokeResultContainer;

  export interface InvokeResultContainer {
    raw: AIMessage;
    parsed?: InvokeResultParsed | undefined;
  }

  export type InvokeResultParsed = Record<string, unknown>;

  export type MessageContent = AIMessage["content"];
}
