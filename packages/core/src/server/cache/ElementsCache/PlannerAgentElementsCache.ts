import { getLogger } from "../../../utils/index.js";
import type { PlannerAgent } from "../../agents/PlannerAgent.js";
import { BaseAgentElementsCache } from "./BaseAgentElementsCache.js";

const logger = getLogger(import.meta.url);

export class PlannerAgentElementsCache extends BaseAgentElementsCache<PlannerAgent.Meta> {
  async update(
    props: BaseAgentElementsCache.UpdateProps<PlannerAgent.Meta>,
  ): Promise<void> {
    const { cacheHash, memoryKey, meta, generation } = props;
    if (!generation.message?.content) {
      logger.warn(
        `Skipping planner cache update: empty plan content for goal: ${meta.goal.slice(0, 50)}...`,
      );
      return;
    }

    logger.debug(
      `Cashing planner response for goal: "${meta.goal.slice(0, 50)}..."`,
    );

    this.store({
      cacheHash,
      generation,
      elements: [],
      agentType: "planner",
      memoryKey,
      instruction: { goal: meta.goal },
    });
  }
}
