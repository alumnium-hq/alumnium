import { ensure } from "alwaysly";
import type { LchainSchema } from "../../../llm/LchainSchema.ts";
import { Logger } from "../../../telemetry/Logger.ts";

const logger = Logger.get(import.meta.url);

export abstract class ElementsCacheMask {
  static ID_FIELDS = new Set(["id", "from_id", "to_id"]);

  static mask(
    generation: LchainSchema.StoredGeneration,
    elementIds: number[],
  ): LchainSchema.StoredGeneration {
    const masked = structuredClone(generation);

    if (!elementIds.length) return masked;

    try {
      const idToMask = new Map(elementIds.map((id, index) => [id, index]));

      if (Array.isArray(masked.message?.data.content)) {
        masked.message?.data.content.forEach((content) => {
          if (typeof content !== "object") return;

          let args: Record<string, unknown> | undefined;
          switch (content.type) {
            case "functionCall":
              args = content.functionCall.args;
              break;
            case "tool_use":
              args = content.input;
              break;
          }
          this.#maskArgs(args, idToMask);
        });
      }

      for (const call of masked.message?.data.tool_calls || []) {
        this.#maskArgs(call.args, idToMask);
      }

      return masked;
    } catch (error) {
      logger.debug(`Error masking response: ${error}`);
      return masked;
    }
  }

  static #maskArgs(
    args: Record<string, unknown> | undefined,
    idToMask: Map<number, number>,
  ) {
    if (!args) return;
    this.ID_FIELDS.forEach((field) => {
      const value = args[field];
      if (typeof value === "number" && idToMask.has(value)) {
        const maskedId = idToMask.get(value);
        ensure(maskedId);
        args[field] = this.#maskValue(maskedId);
      }
    });
  }

  static unmask(
    generation: LchainSchema.StoredGeneration,
    maskToId: Record<number, number>,
  ): LchainSchema.StoredGeneration {
    const unmasked = structuredClone(generation);

    if (!Object.keys(maskToId).length) return unmasked;

    try {
      for (const toolCall of unmasked.message?.data.tool_calls ?? []) {
        this.#unmaskArgs(toolCall.args, maskToId);
      }

      if (Array.isArray(unmasked.message?.data.content)) {
        unmasked.message?.data.content.forEach((content) => {
          if (typeof content !== "object") return;
          let args: Record<string, unknown> | undefined;
          switch (content.type) {
            case "functionCall":
              args = content.functionCall.args;
              break;
            case "tool_use":
              args = content.input;
              break;
          }
          this.#unmaskArgs(args, maskToId);
        });
      }

      return unmasked;
    } catch (error) {
      logger.debug(`Error unmasking response: ${error}`);
      return generation;
    }
  }

  static #unmaskArgs(
    args: Record<string, unknown> | undefined,
    maskToId: Record<number, number>,
  ) {
    if (!args) return;
    ElementsCacheMask.ID_FIELDS.forEach((field) => {
      if (field in args) {
        args[field] = this.#unmaskValue(args[field], maskToId);
      }
    });
  }

  static #MASKED_RE = /^<MASKED_(\d+)>$/;

  static #maskValue(maskedId: number): string {
    return `<MASKED_${maskedId}>`;
  }

  static #unmaskValue(
    value: unknown,
    maskToId: Record<number, number>,
  ): unknown {
    if (
      typeof value === "string" &&
      value.startsWith("<MASKED_") &&
      value.endsWith(">")
    ) {
      const captures = this.#MASKED_RE.exec(value);
      if (captures) {
        const maskedId = Number(captures[1]);
        if (!Number.isNaN(maskedId) && maskedId in maskToId) {
          return maskToId[maskedId];
        }
      }
    }
    return value;
  }
}
