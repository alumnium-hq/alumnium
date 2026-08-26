import { xxh64Str } from "@js-fns/xxhash/str";
import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { Logger } from "../../../telemetry/Logger.ts";
import { PlannerAgent } from "../../agents/PlannerAgent.ts";
import { BaseAgentElementsCache } from "./BaseAgentElementsCache.ts";

const logger = Logger.get(import.meta.url);
const CACHE_VERSION = "ai-sdk-v1";

export class PlannerAgentElementsCache extends BaseAgentElementsCache<PlannerAgent.Meta> {
  static isCacheable(generation: LanguageModelV4GenerateResult): boolean {
    const text = generation.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("");
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      return Boolean(text);
    }
    const parsed = PlannerAgent.Plan.safeParse(value);
    return !parsed.success || parsed.data.actions.some(Boolean);
  }

  async update(
    props: BaseAgentElementsCache.UpdateProps<PlannerAgent.Meta>,
  ): Promise<void> {
    const { cacheHash, memoryKey, meta, generation } = props;
    const { goal } = meta;

    if (!generation.content.length) {
      logger.warn(
        `Skipping planner cache update: empty plan content for goal: ${goal.slice(0, 50)}...`,
      );
      return;
    }

    if (!PlannerAgentElementsCache.isCacheable(generation)) {
      logger.debug(
        `Skipping planner cache update: plan has no actions for goal: ${goal.slice(0, 50)}...`,
      );
      return;
    }

    logger.debug(
      `Caching planner response for goal: "${goal.slice(0, 50)}..."`,
    );

    this.setRecord({
      cacheHash,
      generation,
      elements: [],
      agentKind: "planner",
      memoryKey,
      instruction: { goal },
    });
  }

  updateElements(
    goal: string,
    newElements: Array<Record<string, string | number>>,
  ): void {
    try {
      const goalHash = xxh64Str(CACHE_VERSION + goal);

      for (const [memoryKey, entry] of this.getEntries()) {
        const { cacheHash, agentKind, app } = entry;
        if (
          cacheHash !== goalHash ||
          agentKind !== "planner" ||
          app !== this.app
        )
          continue;

        const existingKeys = new Set(
          entry.elements.map((el) => this.#elementDedupKey(el)),
        );
        const mergedEls = [...entry.elements];
        for (const newEl of newElements) {
          const dedupKey = this.#elementDedupKey(newEl);
          if (!existingKeys.has(dedupKey)) {
            existingKeys.add(dedupKey);
            mergedEls.push(newEl);
          }
        }

        this.setRecord({
          ...entry,
          memoryKey,
          elements: mergedEls,
        });

        logger.debug(
          `Updated planner elements: ${mergedEls.length} total elements`,
        );
        break;
      }
    } catch (error) {
      logger.debug(`Error updating planner elements: ${error}`);
    }
  }

  #elementDedupKey(element: Record<string, string | number>): string {
    const parts = Object.entries(element)
      .filter(([key]) => key !== "index")
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return JSON.stringify(parts);
  }
}
