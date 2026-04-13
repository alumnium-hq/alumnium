import {
  deserializeStoredGeneration,
  serializeGeneration,
} from "@langchain/core/caches";
import type { StoredGeneration } from "@langchain/core/messages";
import type { Generation } from "@langchain/core/outputs";
import z from "zod";
import { logSchemaParseError } from "../utils/logFormat.ts";
import { scanTypes } from "../utils/typesScan.ts";

export namespace Lchain {
  export type UnknownRecord = z.infer<typeof Lchain.UnknownRecord>;
  export type MessageContentObjectText = z.infer<
    typeof Lchain.MessageContentObjectText
  >;
  export type MessageContentObjectReasoing = z.infer<
    typeof Lchain.MessageContentObjectReasoing
  >;
  export type MessageContentObjectGoogleFunctionCall = z.infer<
    typeof Lchain.MessageContentObjectGoogleFunctionCall
  >;
  export type MessageContentObject = z.infer<
    typeof Lchain.MessageContentObject
  >;
  export type MessageContent = z.infer<typeof Lchain.MessageContent>;
  export type ModalitiesTokenDetails = z.infer<
    typeof Lchain.ModalitiesTokenDetails
  >;
  export type InputTokenDetails = z.infer<typeof Lchain.InputTokenDetails>;
  export type OutputTokenDetails = z.infer<typeof Lchain.OutputTokenDetails>;
  export type UsageMetadata = z.infer<typeof Lchain.UsageMetadata>;
  export type GoogleFunctionCall = z.infer<typeof Lchain.GoogleFunctionCall>;
  export type ToolCall = z.infer<typeof Lchain.ToolCall>;
  export type InvalidToolCall = z.infer<typeof Lchain.InvalidToolCall>;
  export type Reasoning = z.infer<typeof Lchain.Reasoning>;
  export type AdditionalKwargs = z.infer<typeof Lchain.AdditionalKwargs>;
  export type ResponseMetadata = z.infer<typeof Lchain.ResponseMetadata>;
  export type Message = z.infer<typeof Lchain.Message>;
  export type Generation = z.infer<typeof Lchain.Generation>;
  export type StoredMessageData = z.infer<typeof Lchain.StoredMessageData>;
  export type StoredMessage = z.infer<typeof Lchain.StoredMessage>;
  export type StoredGeneration = z.infer<typeof Lchain.StoredGeneration>;
  export type Generations = z.infer<typeof Lchain.Generations>;
  export type GenerationsSingle = z.infer<typeof Lchain.GenerationsSingle>;
}

export abstract class Lchain {
  static UnknownRecord = z.record(z.string(), z.unknown());

  static MessageContentObjectText = z.object({
    type: z.literal("text"),
    text: z.string(),
    //TODO: Required?
    // annotations: z.array(z.unknown()),
  });

  static MessageContentObjectReasoing = z.object({
    type: z.literal("reasoning"),
    reasoning: z.string(),
  });

  static OpenAIFunctionCall = z.object({
    arguments: z.string(),
    name: z.string(),
  });

  static GoogleFunctionCall = z.object({
    name: z.string(),
    args: z.record(z.string(), z.unknown()),
    id: z.string(),
  });

  static MessageContentObjectGoogleFunctionCall = z.object({
    type: z.literal("functionCall"),
    functionCall: this.GoogleFunctionCall,
  });

  static MessageContentObjectAnthropicToolUse = z.object({
    type: z.literal("tool_use"),
    id: z.string(),
    name: z.string(),
    input: z.record(z.string(), z.unknown()),
    caller: z.unknown(),
  });

  static MessageContentObjectThinking = z.object({
    type: z.literal("thinking"),
    thinking: z.string(),
    signature: z.string().optional(),
  });

  static MessageContentObject = z.union([
    Lchain.MessageContentObjectText,
    Lchain.MessageContentObjectReasoing,
    Lchain.MessageContentObjectThinking,
    Lchain.MessageContentObjectGoogleFunctionCall,
    Lchain.MessageContentObjectAnthropicToolUse,
  ]);

  static MessageContent = z.union([
    z.string(),
    z.array(z.union([z.string(), Lchain.MessageContentObject])),
  ]);

  static ModalitiesTokenDetails = z.object({
    text: z.number().optional(),
    image: z.number().optional(),
    audio: z.number().optional(),
    video: z.number().optional(),
    document: z.number().optional(),
  });

  static InputTokenDetails = Lchain.ModalitiesTokenDetails.extend({
    cache_read: z.number().optional(),
    cache_creation: z.number().optional(),
  });

  static OutputTokenDetails = Lchain.ModalitiesTokenDetails.extend({
    reasoning: z.number().optional(),
  });

  static UsageMetadata = z.object({
    input_tokens: z.number().optional(),
    output_tokens: z.number().optional(),
    total_tokens: z.number().optional(),
    input_token_details: Lchain.InputTokenDetails.optional(),
    output_token_details: Lchain.OutputTokenDetails.optional(),
  });

  static ToolCall = z.object({
    type: z.literal("tool_call"),
    id: z.string().optional(),
    name: z.string(),
    args: Lchain.UnknownRecord,
  });

  static InvalidToolCall = z.object({
    type: z.literal("invalid_tool_call").optional(),
    id: z.string().optional(),
    name: z.string().optional(),
    args: z.string().optional(),
    error: z.string().optional(),
    index: z.union([z.string(), z.number()]).optional(),
  });

  static Reasoning = z.object({
    id: z.string().optional(),
    type: z.string().optional(),
    summary: z.array(z.string()).optional(),
  });

  static AdditionalKwargs = z.object({
    function_call: Lchain.OpenAIFunctionCall.optional(),
    tool_calls: z.array(Lchain.ToolCall).optional(),
  });

  static ResponseMetadata = z.object({
    model_provider: z.string().optional(),
    model_name: z.string().optional(),
    output_version: z.enum(["v0", "v1"]).optional(),
  });

  static MessageId = z.union([z.string(), z.array(z.string())]);

  static Message = z.object({
    type: z.string(),
    id: Lchain.MessageId.optional(),
    name: z.string().optional(),
    content: Lchain.MessageContent,
    additional_kwargs: Lchain.AdditionalKwargs.optional(),
    response_metadata: Lchain.ResponseMetadata.optional(),
    tool_calls: z.array(Lchain.ToolCall).optional(),
    invalid_tool_calls: z.array(Lchain.InvalidToolCall).optional(),
    usage_metadata: Lchain.UsageMetadata.optional(),
    tool_call_id: z.string().optional(),
    status: z.enum(["success", "error"]).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    artifact: z.unknown().optional(),
  });

  static Generation = z.object({
    text: z.string(),
    generationInfo: z.record(z.string(), z.unknown()).optional(),
    message: Lchain.Message.optional(),
  });

  static Generations = z.tuple([Lchain.Generation]).rest(Lchain.Generation);

  static GenerationsSingle = z.tuple([Lchain.Generation]);

  static StoredMessageData = z.object({
    id: z.string().optional(),
    content: Lchain.MessageContent,
    tool_calls: z.array(Lchain.ToolCall).optional(),
    invalid_tool_calls: z.array(Lchain.InvalidToolCall).optional(),
    usage_metadata: Lchain.UsageMetadata.optional(),
    tool_call_id: z.union([z.string(), z.undefined()]).optional(),
    // TODO: Use `Lchain.AdditionalKwargs.optional()`?
    additional_kwargs: Lchain.UnknownRecord,
    // TODO: Use `Lchain.ResponseMetadata.optional(),`?
    response_metadata: Lchain.UnknownRecord,
  });

  static StoredMessage = z.object({
    type: z.string(),
    data: Lchain.StoredMessageData,
  });

  static StoredGeneration = z.object({
    text: z.string(),
    message: Lchain.StoredMessage.optional(),
  });

  static toStored(this: void, generation: Generation): Lchain.StoredGeneration {
    const stored = serializeGeneration(generation);
    scanTypes(import.meta.url, "serialized", stored);
    const result = Lchain.StoredGeneration.safeParse(stored);
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

  static fromStored(stored: Lchain.StoredGeneration): Generation {
    return deserializeStoredGeneration(stored as StoredGeneration);
  }
}
