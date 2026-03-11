import { ensure } from "alwaysly";
import type { Lchain } from "../../../llm/Lchain.js";
import { getLogger } from "../../../utils/logger.js";

const logger = getLogger(import.meta.url);

export abstract class ElementsCacheMask {
  static ID_FIELDS = new Set(["id", "from_id", "to_id"]);

  static mask(
    generation: Lchain.StoredGeneration,
    elementIds: number[],
  ): Lchain.StoredGeneration {
    const masked = structuredClone(generation);

    if (!elementIds.length) return masked;

    try {
      const idToMask = new Map(elementIds.map((id, index) => [id, index]));

      for (const call of masked.message?.data.tool_calls || []) {
        const args = call.args ?? {};
        this.ID_FIELDS.forEach((field) => {
          const value = args[field];
          if (typeof value === "number" && idToMask.has(value)) {
            const maskedId = idToMask.get(value);
            ensure(maskedId);
            args[field] = this.#maskValue(maskedId);
          }
        });
      }

      return masked;
    } catch (error) {
      logger.debug(`Error masking response: ${error}`);
      return masked;
    }
  }

  static unmask(
    generation: Lchain.StoredGeneration,
    maskToId: Record<number, number>,
  ): Lchain.StoredGeneration {
    const unmasked = structuredClone(generation);

    if (!Object.keys(maskToId).length) return unmasked;

    try {
      for (const toolCall of unmasked.message?.data.tool_calls ?? []) {
        const args = toolCall.args ?? {};
        for (const field of ElementsCacheMask.ID_FIELDS) {
          if (field in args) {
            args[field] = this.#unmaskValue(args[field], maskToId);
          }
        }
      }

      return unmasked;
    } catch (error) {
      logger.debug(`Error unmasking response: ${error}`);
      return generation;
    }
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
