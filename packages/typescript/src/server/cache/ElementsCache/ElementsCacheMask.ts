import { ensure } from "alwaysly";
import type { LchainSchema } from "../../../llm/LchainSchema.ts";
import type { Params } from "../../../Params.ts";
import { Logger } from "../../../telemetry/Logger.ts";

const logger = Logger.get(import.meta.url);

export namespace ElementsCacheMask {
  export type ArgsFn = (args: Record<string, unknown> | undefined) => void;
}

export abstract class ElementsCacheMask {
  static ID_FIELDS = new Set(["id", "from_id", "to_id"]);

  /**
   * Replaces goal parameter values in the cached tool call arguments with their
   * placeholders, so that a cached response does not depend on the value it was
   * recorded with.
   *
   * @param generation - Generation to mask.
   * @param params - Goal parameters in play.
   * @returns Generation with the parameter values masked.
   */
  static maskParams(
    generation: LchainSchema.StoredGeneration,
    params: Params,
  ): LchainSchema.StoredGeneration {
    return this.#mapStringArgs(generation, (value) => params.mask(value));
  }

  /**
   * Substitutes fresh goal parameter values into the cached tool call
   * arguments.
   *
   * @param generation - Generation read from the cache.
   * @param params - Goal parameters in play.
   * @returns Generation with the parameter values substituted.
   */
  static substituteParams(
    generation: LchainSchema.StoredGeneration,
    params: Params,
  ): LchainSchema.StoredGeneration {
    return this.#mapStringArgs(generation, (value) => params.substitute(value));
  }

  static #mapStringArgs(
    generation: LchainSchema.StoredGeneration,
    mapValue: (value: string) => string,
  ): LchainSchema.StoredGeneration {
    const mapped = structuredClone(generation);

    try {
      this.#eachArgs(mapped, (args) => {
        if (!args) return;
        for (const [key, value] of Object.entries(args)) {
          if (typeof value === "string") args[key] = mapValue(value);
        }
      });
    } catch (error) {
      logger.debug(`Error mapping response arguments: ${error}`);
    }

    return mapped;
  }

  /**
   * Visits the arguments of every tool call in a generation, wherever the
   * provider happened to put them.
   */
  static #eachArgs(
    generation: LchainSchema.StoredGeneration,
    fn: ElementsCacheMask.ArgsFn,
  ) {
    for (const call of generation.message?.data.tool_calls || []) {
      fn(call.args);
    }

    if (!Array.isArray(generation.message?.data.content)) return;

    generation.message?.data.content.forEach((content) => {
      if (typeof content !== "object") return;

      switch (content.type) {
        case "functionCall":
          return fn(content.functionCall.args);
        case "tool_use":
          return fn(content.input);
      }
    });
  }

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
