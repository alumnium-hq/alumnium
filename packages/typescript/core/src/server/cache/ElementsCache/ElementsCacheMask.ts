import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { AiSdk } from "../../../llm/AiSdk.ts";
import { Params } from "../../../Params.ts";
import { Logger } from "../../../telemetry/Logger.ts";

const logger = Logger.get(import.meta.url);

export abstract class ElementsCacheMask {
  static ID_FIELDS = new Set(["id", "from_id", "to_id"]);
  static #MASKED_RE = /^<MASKED_(\d+)>$/;

  static mask(
    result: LanguageModelV4GenerateResult,
    elementIds: number[],
    params?: Params.Values,
  ): LanguageModelV4GenerateResult | null {
    const masked = structuredClone(result);

    try {
      const idToMask = new Map(elementIds.map((id, index) => [id, index]));
      for (const toolCall of AiSdk.toolCalls(masked)) {
        const input = AiSdk.toolCallInput(toolCall);
        if (input.kind === "malformed") return null;
        if (
          input.kind === "object" &&
          this.#maskInput(input.value, idToMask, params)
        ) {
          toolCall.input = JSON.stringify(input.value);
        }
      }
      for (const part of masked.content) {
        if (part.type !== "text") continue;
        part.text = Params.mask(part.text, params);
        const output = AiSdk.textObject(part);
        if (output && this.#maskIds(output, idToMask)) {
          part.text = JSON.stringify(output);
        }
      }
    } catch (error) {
      logger.debug(`Error masking response: ${error}`);
      return null;
    }
    return masked;
  }

  static unmask(
    result: LanguageModelV4GenerateResult,
    maskToId: Record<number, number>,
    params?: Params.Values,
  ): LanguageModelV4GenerateResult | null {
    const unmasked = structuredClone(result);

    try {
      for (const toolCall of AiSdk.toolCalls(unmasked)) {
        const input = AiSdk.toolCallInput(toolCall);
        if (input.kind === "malformed") return null;
        if (input.kind === "object") {
          const changed = this.#unmaskInput(input.value, maskToId, params);
          if (changed === null) return null;
          if (changed) toolCall.input = JSON.stringify(input.value);
        }
      }
      for (const part of unmasked.content) {
        if (part.type !== "text") continue;
        const output = AiSdk.textObject(part);
        if (output) {
          const changed = this.#unmaskIds(output, maskToId);
          if (changed === null) return null;
          if (changed) part.text = JSON.stringify(output);
        }
        part.text = Params.substitute(part.text, params);
      }
    } catch (error) {
      logger.debug(`Error unmasking response: ${error}`);
      return null;
    }
    return unmasked;
  }

  static #maskInput(
    input: Record<string, unknown>,
    idToMask: Map<number, number>,
    params?: Params.Values,
  ): boolean {
    const changed = this.#mapStrings(input, (value) =>
      Params.mask(value, params),
    );
    return this.#maskIds(input, idToMask) || changed;
  }

  static #maskIds(
    input: Record<string, unknown>,
    idToMask: Map<number, number>,
  ): boolean {
    let changed = false;
    for (const field of this.ID_FIELDS) {
      const value = input[field];
      const mask = typeof value === "number" ? idToMask.get(value) : undefined;
      if (mask !== undefined) {
        input[field] = `<MASKED_${mask}>`;
        changed = true;
      }
    }
    return changed;
  }

  static #unmaskInput(
    input: Record<string, unknown>,
    maskToId: Record<number, number>,
    params?: Params.Values,
  ): boolean | null {
    const changed = this.#unmaskIds(input, maskToId);
    if (changed === null) return null;
    return (
      this.#mapStrings(input, (value) => Params.substitute(value, params)) ||
      changed
    );
  }

  static #unmaskIds(
    input: Record<string, unknown>,
    maskToId: Record<number, number>,
  ): boolean | null {
    let changed = false;
    for (const field of this.ID_FIELDS) {
      const value = input[field];
      if (typeof value !== "string") continue;
      const match = this.#MASKED_RE.exec(value);
      if (!match) continue;
      const mask = Number(match[1]);
      if (!(mask in maskToId)) return null;
      input[field] = maskToId[mask];
      changed = true;
    }
    return changed;
  }

  static #mapStrings(
    input: Record<string, unknown>,
    fn: (value: string) => string,
  ): boolean {
    let changed = false;
    for (const [field, value] of Object.entries(input)) {
      if (value && typeof value === "object") {
        changed =
          this.#mapStrings(value as Record<string, unknown>, fn) || changed;
      } else if (typeof value === "string" && fn(value) !== value) {
        input[field] = fn(value);
        changed = true;
      }
    }
    return changed;
  }
}
