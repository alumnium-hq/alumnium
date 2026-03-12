import { getLogger } from "../../../utils/index.js";
import type { ActorAgent } from "../../agents/ActorAgent.js";
import type { SessionContext } from "../../session/SessionContext.js";
import { BaseAgentElementsCache } from "./BaseAgentElementsCache.js";
import type { ElementsCache } from "./ElementsCache.js";
import { ElementsCacheMask } from "./ElementsCacheMask.js";
import { ElementsCacheToolCalls } from "./ElementsCacheToolCalls.js";
import { ElementsCacheTree } from "./ElementsCacheTree.js";
import type { PlannerAgentElementsCache } from "./PlannerAgentElementsCache.js";

const logger = getLogger(import.meta.url);

export namespace ActorAgentElementsCache {
  export interface Props {
    sessionContext: SessionContext;
    plannerCache: PlannerAgentElementsCache;
  }
}

export class ActorAgentElementsCache extends BaseAgentElementsCache<ActorAgent.Meta> {
  readonly #plannerCache: PlannerAgentElementsCache;

  constructor(props: ActorAgentElementsCache.Props) {
    const { sessionContext, plannerCache } = props;
    super(sessionContext);
    this.#plannerCache = plannerCache;
  }

  async update(
    props: BaseAgentElementsCache.UpdateProps<ActorAgent.Meta>,
  ): Promise<void> {
    const { cacheHash, memoryKey, meta, generation } = props;
    const { goal, step, treeXml } = meta;

    const toolCalls = generation.message?.data.tool_calls;
    if (!toolCalls?.length) {
      logger.debug(
        `Skipping actor cache update: no tool calls for step: "${step.slice(0, 50)}..."`,
      );
      return;
    }

    const tree = new ElementsCacheTree(treeXml);

    const elIds = ElementsCacheToolCalls.extractElementIds(generation);
    const els: ElementsCache.Elements = [];
    for (const elId of elIds) {
      const attrs = tree.extractAttrs(elId);
      if (attrs) els.push(attrs);
    }

    if (!els.length) {
      logger.debug(
        `Skipping actor cache update: no elements extracted for step: "${step.slice(0, 50)}..."`,
      );
      return;
    }

    logger.debug(
      `Cashing actor response for step: "${step.slice(0, 50)}..."`,
    );

    const masked = ElementsCacheMask.mask(generation, elIds);

    this.setRecord({
      cacheHash,
      generation: masked,
      elements: els,
      agentType: "actor",
      memoryKey,
      instruction: { goal, step },
    });

    if (goal) {
      this.#plannerCache.updateElements(goal, els);
    }
  }
}
