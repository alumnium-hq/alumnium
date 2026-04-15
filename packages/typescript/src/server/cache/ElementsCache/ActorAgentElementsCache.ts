import { Logger } from "../../../telemetry/Logger.ts";
import type { ActorAgent } from "../../agents/ActorAgent.ts";
import type { SessionContext } from "../../session/SessionContext.ts";
import { BaseAgentElementsCache } from "./BaseAgentElementsCache.ts";
import type { ElementsCache } from "./ElementsCache.ts";
import { ElementsCacheMask } from "./ElementsCacheMask.ts";
import { ElementsCacheToolCalls } from "./ElementsCacheToolCalls.ts";
import { ElementsCacheTree } from "./ElementsCacheTree.ts";
import type { PlannerAgentElementsCache } from "./PlannerAgentElementsCache.ts";

const logger = Logger.get(import.meta.url);

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

    logger.debug(`Caching actor response for step: "${step.slice(0, 50)}..."`);

    const masked = ElementsCacheMask.mask(generation, elIds);

    this.setRecord({
      cacheHash,
      generation: masked,
      elements: els,
      agentKind: "actor",
      memoryKey,
      instruction: { goal, step },
    });

    if (goal) {
      this.#plannerCache.updateElements(goal, els);
    }
  }
}
