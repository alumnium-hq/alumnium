import { xxh32 } from "smolxxh";
import { Lchain } from "../../../llm/Lchain.js";
import { getLogger } from "../../../utils/index.js";
import type { ActorAgent } from "../../agents/ActorAgent.js";
import { BaseAgentElementsCache } from "./BaseAgentElementsCache.js";
import type { ElementsCache } from "./ElementsCache.js";
import { ElementsCacheMask } from "./ElementsCacheMask.js";
import { ElementsCacheToolCalls } from "./ElementsCacheToolCalls.js";
import { ElementsCacheTree } from "./ElementsCacheTree.js";

const logger = getLogger(import.meta.url);

export class ActorAgentElementsCache extends BaseAgentElementsCache<ActorAgent.Meta> {
  async update(
    props: BaseAgentElementsCache.UpdateProps<ActorAgent.Meta>,
  ): Promise<void> {
    const { cacheHash, memoryKey, meta, generation } = props;

    const toolCalls = generation.message?.tool_calls;
    if (!toolCalls?.length) {
      logger.debug(
        `Skipping actor cache update: no tool calls for step: "${meta.step.slice(0, 50)}..."`,
      );
      return;
    }

    const tree = new ElementsCacheTree(meta.accessibilityTreeXml);

    const elIds = ElementsCacheToolCalls.extractElementIds(generation);
    const els: ElementsCache.Elements = [];
    for (const elId of elIds) {
      const attrs = tree.extractAttrs(elId);
      if (attrs) els.push(attrs);
    }

    if (!els.length) {
      logger.debug(
        `Skipping actor cache update: no elements extracted for step: "${meta.step.slice(0, 50)}..."`,
      );
      return;
    }

    logger.debug(
      `Cashing actor response for step: "${meta.step.slice(0, 50)}..."`,
    );

    const stored = Lchain.toStored(generation);
    const masked = ElementsCacheMask.mask(stored, elIds);

    this.store({
      cacheHash,
      generation: masked,
      elements: els,
      agentType: "actor",
      memoryKey,
      instruction: { goal: meta.goal, step: meta.step },
    });

    if (meta.goal) {
      this.#updatePlannerElements(meta.goal, els);
    }
  }

  //#region Planner elements update

  // TODO: This must be in PlannerAgentElementsCache, but it is part of
  // the actor agent update flow, so we need to figure out a place for it and
  // how to trigger it properly.

  #updatePlannerElements(
    goal: string,
    newElements: Array<Record<string, string | number>>,
  ): void {
    try {
      const goalHash = xxh32(Buffer.from(goal, "utf8")).toString(16);

      for (const [memoryKey, entry] of Object.entries(this.memoryCache)) {
        const { cacheHash, agentType, app, elements } = entry;
        if (
          cacheHash !== goalHash ||
          agentType !== "planner" ||
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

        this.memoryCache[memoryKey as ElementsCache.MemoryKey] = {
          ...entry,
          elements: mergedEls,
        };
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

  //#endregion
}
