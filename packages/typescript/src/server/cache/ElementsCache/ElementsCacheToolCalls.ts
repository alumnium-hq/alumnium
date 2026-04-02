import type { Lchain } from "../../../llm/Lchain.ts";
import { getLogger } from "../../../utils/logger.ts";

const logger = getLogger(import.meta.url);

export abstract class ElementsCacheToolCalls {
  static ID_FIELDS = ["id", "from_id", "to_id"] as const;

  static extractElementIds(generation: Lchain.StoredGeneration): number[] {
    const ids: number[] = [];
    const seen = new Set<number>();

    try {
      if (!generation) {
        return ids;
      }

      const toolCalls = generation.message?.data.tool_calls ?? [];

      for (const toolCall of toolCalls) {
        const args = toolCall.args ?? {};
        for (const field of this.ID_FIELDS) {
          const value = args[field];
          if (typeof value === "number" && !seen.has(value)) {
            seen.add(value);
            ids.push(value);
          }
        }
      }
    } catch (error) {
      logger.debug(`Error extracting element IDs: ${error}`);
    }

    return ids;
  }
}
