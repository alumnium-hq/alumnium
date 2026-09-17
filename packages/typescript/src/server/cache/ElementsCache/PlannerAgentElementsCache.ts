import { xxh64Str } from "@js-fns/xxhash/str";
import type { LchainSchema } from "../../../llm/LchainSchema.ts";
import { Logger } from "../../../telemetry/Logger.ts";
import { PlannerAgent } from "../../agents/PlannerAgent.ts";
import { BaseAgentElementsCache } from "./BaseAgentElementsCache.ts";

const logger = Logger.get(import.meta.url);

export class PlannerAgentElementsCache extends BaseAgentElementsCache<PlannerAgent.Meta> {
  /**
   * A plan with no actions means the planner could not find its target on that particular
   * screen. Planner entries are keyed by goal alone and carry no elements to resolve, so such a
   * plan would match every later screen too and silently turn the goal into a no-op.
   *
   * The plan may live in `additional_kwargs.parsed` (OpenAI JSON schema output), in a tool call
   * (Anthropic, Google) or only in the raw text, so all three are inspected.
   */
  static isEmptyPlan(generation: LchainSchema.StoredGeneration): boolean {
    const data = generation.message?.data;
    const candidates: unknown[] = [
      data?.additional_kwargs.parsed,
      ...(data?.tool_calls ?? []).map((call) => call.args),
    ];
    try {
      candidates.push(JSON.parse(generation.text));
    } catch {
      // Not a JSON plan; nothing to inspect.
    }

    return candidates.some((candidate) => {
      const parsed = PlannerAgent.Plan.safeParse(candidate);
      return parsed.success && !parsed.data.actions.some(Boolean);
    });
  }

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

    if (PlannerAgentElementsCache.isEmptyPlan(generation)) {
      logger.debug(
        `Skipping planner cache update: no actions planned for goal: ${goal.slice(0, 50)}...`,
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
