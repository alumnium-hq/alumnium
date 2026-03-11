import type { AppId } from "../../../AppId.js";
import { Lchain } from "../../../llm/Lchain.js";
import { getLogger } from "../../../utils/index.js";
import type { SessionContext } from "../../session/SessionContext.js";
import type { ElementsCache } from "./ElementsCache.js";
import { ElementsCacheMask } from "./ElementsCacheMask.js";

const logger = getLogger(import.meta.url);

export namespace BaseAgentElementsCache {
  export interface UpdateProps<AgentMeta> {
    memoryKey: ElementsCache.MemoryKey;
    cacheHash: ElementsCache.CacheHash;
    meta: AgentMeta;
    generation: Lchain.Generation;
  }

  export interface StoreProps {
    generation: Lchain.Generation | Lchain.StoredGeneration;
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
  protected memoryCache: ElementsCache.MemoryCache;

  constructor(
    sessionContext: SessionContext,
    memoryCache: ElementsCache.MemoryCache,
  ) {
    super();
    this.#sessionContext = sessionContext;
    // TODO: Instead maintain own memory cache that would be triggered to save
    // by the ElementsCache. This will remove extra state.
    this.memoryCache = memoryCache;
  }

  abstract update(
    props: BaseAgentElementsCache.UpdateProps<AgentMeta>,
  ): Promise<void>;

  protected get app(): AppId {
    return this.#sessionContext.app;
  }

  protected store(props: BaseAgentElementsCache.StoreProps): void {
    const {
      generation,
      memoryKey,
      cacheHash,
      agentType,
      elements,
      instruction,
    } = props;
    let storedGeneration: Lchain.StoredGeneration;
    try {
      storedGeneration = Lchain.StoredGeneration.parse(generation);
    } catch {
      storedGeneration = Lchain.toStored(generation as Lchain.Generation);
    }

    this.memoryCache[memoryKey] = {
      generation: storedGeneration,
      cacheHash,
      elements,
      agentType,
      app: this.app,
      instruction,
    };
  }
}
