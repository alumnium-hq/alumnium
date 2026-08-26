import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { AiSdk } from "../../../llm/AiSdk.ts";
import { Logger } from "../../../telemetry/Logger.ts";

const logger = Logger.get(import.meta.url);

export abstract class ElementsCacheToolCalls {
  static ID_FIELDS = ["id", "from_id", "to_id"] as const;

  static extractElementIds(
    generation: LanguageModelV4GenerateResult,
  ): number[] {
    const ids: number[] = [];
    const seen = new Set<number>();

    for (const toolCall of AiSdk.toolCalls(generation)) {
      const input = AiSdk.toolCallInput(toolCall);
      if (input.kind === "malformed") {
        logger.debug(`Error extracting element IDs: malformed tool input`);
        continue;
      }
      if (input.kind !== "object") continue;

      for (const field of this.ID_FIELDS) {
        const value = input.value[field];
        if (typeof value === "number" && !seen.has(value)) {
          seen.add(value);
          ids.push(value);
        }
      }
    }

    return ids;
  }
}
