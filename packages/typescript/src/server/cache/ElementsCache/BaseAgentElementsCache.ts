import type { AppId } from "../../../AppId.ts";
import type { LchainSchema } from "../../../llm/LchainSchema.ts";
import type { SessionContext } from "../../session/SessionContext.ts";
import type { ElementsCache } from "./ElementsCache.ts";
import { ElementsCacheMask } from "./ElementsCacheMask.ts";

export namespace BaseAgentElementsCache {
  export interface UpdateProps<AgentMeta> {
    memoryKey: ElementsCache.MemoryKey;
    cacheHash: ElementsCache.CacheHash;
    meta: AgentMeta;
    generation: LchainSchema.StoredGeneration;
  }

  export interface StoreProps {
    generation: LchainSchema.StoredGeneration;
    memoryKey: ElementsCache.MemoryKey;
    cacheHash: ElementsCache.CacheHash;
    agentKind: ElementsCache.EligibleAgentKind;
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
      agentKind,
      elements,
      instruction,
    } = props;

    this.memoryCache[memoryKey] = {
      generation,
      cacheHash,
      elements,
      agentKind,
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
