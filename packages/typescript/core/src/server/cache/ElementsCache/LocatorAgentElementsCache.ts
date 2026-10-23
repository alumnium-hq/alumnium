import { Logger } from "../../../telemetry/Logger.ts";
import type { LocatorAgent } from "../../agents/LocatorAgent.ts";
import { BaseAgentElementsCache } from "./BaseAgentElementsCache.ts";
import type { ElementsCache } from "./ElementsCache.ts";
import { ElementsCacheMask } from "./ElementsCacheMask.ts";
import { ElementsCacheToolCalls } from "./ElementsCacheToolCalls.ts";
import { ElementsCacheTree } from "./ElementsCacheTree.ts";

const logger = Logger.get(import.meta.url);

export class LocatorAgentElementsCache extends BaseAgentElementsCache<LocatorAgent.Meta> {
  async update(
    props: BaseAgentElementsCache.UpdateProps<LocatorAgent.Meta>,
  ): Promise<void> {
    const { cacheHash, memoryKey, meta, generation } = props;
    const { description, treeXml } = meta;

    const elIds = ElementsCacheToolCalls.extractElementIds(generation);
    if (!elIds.length) {
      logger.debug(
        `Skipping locator cache update: no element located for description: "${description.slice(0, 50)}..."`,
      );
      return;
    }

    const tree = new ElementsCacheTree(treeXml);

    const els: ElementsCache.Elements = [];
    for (const elId of elIds) {
      const attrs = tree.extractAttrs(elId);
      // Every located id must be masked, otherwise a stale id would be replayed.
      if (!attrs) {
        logger.debug(
          `Skipping locator cache update: element ${elId} not found for description: "${description.slice(0, 50)}..."`,
        );
        return;
      }
      els.push(attrs);
    }

    const masked = ElementsCacheMask.mask(generation, elIds);
    if (!masked) {
      logger.debug(
        `Skipping locator cache update: malformed response for description: "${description.slice(0, 50)}..."`,
      );
      return;
    }

    logger.debug(
      `Caching locator response for description: "${description.slice(0, 50)}..."`,
    );

    this.setRecord({
      cacheHash,
      generation: masked,
      elements: els,
      agentKind: "locator",
      memoryKey,
      instruction: { description },
    });
  }
}
