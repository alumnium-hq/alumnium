import { xxh64Str } from "smolxxh/str";
import { getLogger } from "../../../utils/index.ts";
import type { PlannerAgent } from "../../agents/PlannerAgent.ts";
import { BaseAgentElementsCache } from "./BaseAgentElementsCache.ts";

const logger = getLogger(import.meta.url);

export class PlannerAgentElementsCache extends BaseAgentElementsCache<PlannerAgent.Meta> {
  async update(
    props: BaseAgentElementsCache.UpdateProps<PlannerAgent.Meta>,
  ): Promise<void> {
    const { cacheHash, memoryKey, meta, generation } = props;
    const { goal } = meta;

    if (!generation.message?.data.content) {
      logger.warn(
        `Skipping planner cache update: empty plan content for goal: ${goal.slice(0, 50)}...`,
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
      const goalHash = xxh64Str(goal);

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
