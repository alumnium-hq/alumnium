import type { AppId } from "../../../AppId.js";
import { Lchain } from "../../../llm/Lchain.js";
import type { SessionContext } from "../../session/SessionContext.js";
import type { ElementsCache } from "./ElementsCache.js";
import { ElementsCacheMask } from "./ElementsCacheMask.js";

export namespace BaseAgentElementsCache {
  export interface UpdateProps<AgentMeta> {
    memoryKey: ElementsCache.MemoryKey;
    cacheHash: ElementsCache.CacheHash;
    meta: AgentMeta;
    generation: Lchain.StoredGeneration;
  }

  export interface StoreProps {
    generation: Lchain.StoredGeneration;
    memoryKey: ElementsCache.MemoryKey;
    cacheHash: ElementsCache.CacheHash;
    agentType: ElementsCache.AgentType;
    elements: ElementsCache.Elements;
    instruction: ElementsCache.Instruction;
  }
}

export abstract class BaseAgentElementsCache<
  AgentMeta,
> extends ElementsCacheMask {
  #sessionContext: SessionContext;
  protected memoryCache: ElementsCache.MemoryCache = {};

  constructor(sessionContext: SessionContext) {
    super();
    this.#sessionContext = sessionContext;
  }

  abstract update(
    props: BaseAgentElementsCache.UpdateProps<AgentMeta>,
  ): Promise<void>;

  protected get app(): AppId {
    return this.#sessionContext.app;
  }

  getRecord(
    memoryKey: ElementsCache.MemoryKey,
  ): ElementsCache.MemoryRecord | null {
    return this.memoryCache[memoryKey] ?? null;
  }

  setRecord(props: BaseAgentElementsCache.StoreProps): void {
    const {
      generation,
      memoryKey,
      cacheHash,
      agentType,
      elements,
      instruction,
    } = props;

    this.memoryCache[memoryKey] = {
      generation,
      cacheHash,
      elements,
      agentType,
      app: this.app,
      instruction,
    };
  }

  getEntries(): ElementsCache.Entries {
    return Object.entries(this.memoryCache) as ElementsCache.Entries;
  }

  discard() {
    this.memoryCache = {};
  }
}
