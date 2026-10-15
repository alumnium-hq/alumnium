import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { AiSdk } from "../../../llm/AiSdk.ts";
import { Logger } from "../../../telemetry/Logger.ts";

const logger = Logger.get(import.meta.url);

export abstract class ElementsCacheMask {
  static ID_FIELDS = new Set(["id", "from_id", "to_id"]);
  static #MASKED_RE = /^<MASKED_(\d+)>$/;

  static mask(
    result: LanguageModelV4GenerateResult,
    elementIds: number[],
  ): LanguageModelV4GenerateResult | null {
    const masked = structuredClone(result);

    try {
      const idToMask = new Map(elementIds.map((id, index) => [id, index]));
      for (const toolCall of AiSdk.toolCalls(masked)) {
        const input = AiSdk.toolCallInput(toolCall);
        if (input.kind === "malformed") return null;
        if (input.kind === "object" && this.#maskInput(input.value, idToMask)) {
          toolCall.input = JSON.stringify(input.value);
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
  ): LanguageModelV4GenerateResult | null {
    const unmasked = structuredClone(result);

    try {
      for (const toolCall of AiSdk.toolCalls(unmasked)) {
        const input = AiSdk.toolCallInput(toolCall);
        if (input.kind === "malformed") return null;
        if (input.kind === "object") {
          const changed = this.#unmaskInput(input.value, maskToId);
          if (changed === null) return null;
          if (changed) toolCall.input = JSON.stringify(input.value);
        }
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
}
