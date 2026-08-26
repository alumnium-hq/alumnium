import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { xxh64Str } from "@js-fns/xxhash/str";
import z from "zod";
import { AppId } from "../../../AppId.ts";
import { AiSdk } from "../../../llm/AiSdk.ts";
import { Telemetry } from "../../../telemetry/Telemetry.ts";
import type { Tracer } from "../../../telemetry/Tracer.ts";
import { ActorAgent } from "../../agents/ActorAgent.ts";
import type { BaseAgent } from "../../agents/BaseAgent.ts";
import { PlannerAgent } from "../../agents/PlannerAgent.ts";
import { SessionContext } from "../../session/SessionContext.ts";
import { CacheStore } from "../CacheStore.ts";
import { ServerCache } from "../ServerCache.ts";
import { ActorAgentElementsCache } from "./ActorAgentElementsCache.ts";
import { ElementsCacheMask } from "./ElementsCacheMask.ts";
import { ElementsCacheTree } from "./ElementsCacheTree.ts";
import { PlannerAgentElementsCache } from "./PlannerAgentElementsCache.ts";

const { logger, tracer } = Telemetry.get(import.meta.url);
const { span } = tracer.dec();

const CACHE_VERSION = "ai-sdk-v1";

export namespace ElementsCache {
  export type MemoryCache = Record<MemoryKey, MemoryRecord>;

  export interface MemoryRecord {
    cacheHash: CacheHash;
    generation: LanguageModelV4GenerateResult;
    elements: Elements;
    agentKind: EligibleAgentKind;
    app: AppId;
    instruction: Instruction;
  }

  export type Instruction = z.infer<typeof ElementsCache.Instruction>;

  export type Elements = z.infer<typeof ElementsCache.Elements>;

  /**
   * Element attributes record.
   */
  export type Element = z.infer<typeof ElementsCache.Element>;

  export type AgentMeta = PlannerAgent.Meta | ActorAgent.Meta;

  export type EligibleAgentKind = AgentMeta["kind"];

  export type CacheHash = z.infer<typeof ElementsCache.CacheHash>;

  export type CacheKey = BaseAgent.Goal | BaseAgent.Step;

  export type MemoryKey = z.infer<typeof ElementsCache.MemoryKey>;

  export interface InitiatedData {
    cacheKey: CacheKey;
    cacheHash: CacheHash;
    memoryKey: MemoryKey;
  }

  export type Entries = [ElementsCache.MemoryKey, ElementsCache.MemoryRecord][];

  export type CacheSource = "store";
}

export class ElementsCache extends ServerCache {
  static Element = z.record(z.string(), z.union([z.string(), z.number()]));

  static Elements = z.array(ElementsCache.Element);

  static Instruction = z.record(z.string(), z.string());

  static CacheHash = z.string().brand("ElementsCache.CacheHash");

  static MemoryKey = z.string().brand("ElementsCache.MemoryKey");

  readonly #cacheStore: CacheStore;
  #plannerCache: PlannerAgentElementsCache;
  #actorCache: ActorAgentElementsCache;

  constructor(sessionContext: SessionContext, cacheStore: CacheStore) {
    super(sessionContext);
    this.#cacheStore = cacheStore.subStore("elements");
    this.#plannerCache = new PlannerAgentElementsCache(sessionContext);
    this.#actorCache = new ActorAgentElementsCache({
      plannerCache: this.#plannerCache,
      sessionContext,
    });
  }

  override async lookup(
    request: ServerCache.CacheRequest,
  ): Promise<LanguageModelV4GenerateResult | null> {
    return tracer.span("cache.lookup", this.#spanAttrs(), async (span) => {
      const agentMeta = request.meta;

      if (agentMeta.kind !== "actor" && agentMeta.kind !== "planner") {
        logger.debug(
          `Agent kind "${agentMeta.kind}" is not eligible for elements caching`,
        );
        span.event("cache.lookup.miss", {
          ...this.#spanAttrs(),
          "agent.kind": agentMeta.kind,
          "cache.lookup.miss.reason": "not_eligible",
        });

        return null;
      }

      const { cacheKey, cacheHash, memoryKey } = this.#initiate(
        agentMeta,
        request,
      );

      try {
        const tree = new ElementsCacheTree(agentMeta.treeXml);

        const memoryEntry = this.#memoryRecord(memoryKey);
        if (memoryEntry) {
          if (
            agentMeta.kind === "planner" &&
            !PlannerAgentElementsCache.isCacheable(memoryEntry.generation)
          ) {
            return null;
          }
          const masksIdsMap = tree.resolveElements(memoryEntry.elements);

          if (masksIdsMap) {
            const unmaskedGeneration = ElementsCacheMask.unmask(
              memoryEntry.generation,
              masksIdsMap,
            );
            if (!unmaskedGeneration) return null;
            this.applyUsage(unmaskedGeneration);

            logger.debug(
              `Elements cache hit (in-memory) for ${agentMeta.kind}: "${cacheKey.slice(0, 50)}..."`,
            );
            span.event("cache.lookup.hit", {
              ...this.#spanAttrs(),
              "agent.kind": agentMeta.kind,
              "cache.hash": cacheHash,
              "cache.lookup.hit.source": "memory",
            });

            return unmaskedGeneration;
          }
        }

        const cacheStore = this.#cacheStore.subStore(
          `${agentMeta.kind}/${cacheHash}`,
        );

        const [elements, maskedGeneration] = await Promise.all([
          cacheStore.readJson("elements.json", ElementsCache.Elements),
          cacheStore.readJson("response.json"),
        ]);

        if (!elements || !maskedGeneration) {
          span.event("cache.lookup.miss", {
            ...this.#spanAttrs(),
            "agent.kind": agentMeta.kind,
            "cache.hash": cacheHash,
            "cache.lookup.miss.reason": "no_match",
          });

          return null;
        }

        const hydratedGeneration = AiSdk.fromStored(maskedGeneration);
        if (
          agentMeta.kind === "planner" &&
          !PlannerAgentElementsCache.isCacheable(hydratedGeneration)
        ) {
          logger.debug(
            `Elements cache miss (planner has no actions): "${cacheKey.slice(0, 50)}..."`,
          );
          return null;
        }

        const masksIdsMap = tree.resolveElements(elements);
        if (!masksIdsMap) {
          logger.debug(
            `Elements cache miss (resolution failed) for ${agentMeta.kind}: "${cacheKey.slice(0, 50)}..."`,
          );
          span.event("cache.lookup.miss", {
            ...this.#spanAttrs(),
            "agent.kind": agentMeta.kind,
            "cache.hash": cacheHash,
            "cache.lookup.miss.reason": "resolution_failed",
          });

          return null;
        }

        const unmaskedGeneration = ElementsCacheMask.unmask(
          hydratedGeneration,
          masksIdsMap,
        );
        if (!unmaskedGeneration) return null;

        this.applyUsage(unmaskedGeneration);

        logger.debug(
          `Elements cache hit (file) for ${agentMeta.kind}: "${cacheKey.slice(0, 50)}..."`,
        );
        span.event("cache.lookup.hit", {
          ...this.#spanAttrs(),
          "agent.kind": agentMeta.kind,
          "cache.hash": cacheHash,
          "cache.lookup.hit.source": "store",
        });

        return unmaskedGeneration;
      } catch (error) {
        logger.debug(`Error in elements cache lookup: ${error}`);
        span.event("cache.lookup.miss", {
          ...this.#spanAttrs(),
          "agent.kind": agentMeta.kind,
          "cache.hash": cacheHash,
          "cache.lookup.miss.reason": "error",
        });

        return null;
      }
    });
  }

  override async update(
    request: ServerCache.CacheRequest,
    result: LanguageModelV4GenerateResult,
  ): Promise<void> {
    return tracer.span("cache.update", this.#spanAttrs(), async (span) => {
      try {
        const agentMeta = request.meta;

        if (agentMeta.kind !== "actor" && agentMeta.kind !== "planner") {
          logger.debug(
            `Agent kind "${agentMeta.kind}" is not eligible for elements caching`,
          );
          span.event("cache.update.skip", {
            ...this.#spanAttrs(),
            "agent.kind": agentMeta.kind,
            "cache.update.skip.reason": "not_eligible",
          });

          return;
        }

        const { cacheHash, memoryKey } = this.#initiate(agentMeta, request);
        const generation = AiSdk.toStored(result);

        switch (agentMeta.kind) {
          case "planner":
            return this.#plannerCache.update({
              cacheHash,
              memoryKey,
              generation,
              meta: agentMeta,
            });

          case "actor":
            return this.#actorCache.update({
              cacheHash,
              memoryKey,
              generation,
              meta: agentMeta,
            });

          default:
            agentMeta satisfies never;
        }
      } catch (error) {
        logger.warn(`Error in elements cache update: {error}`, { error });
      }
    });
  }

  @span("cache.save", spanAttrs)
  async save(): Promise<void> {
    const entries = this.#memoryEntries();
    if (!entries.length) return;

    logger.debug(`Saving ${entries.length} elements cache entries`);

    await Promise.all(
      entries.map(async ([_, entry]) => {
        const { cacheHash, app, agentKind, instruction, generation, elements } =
          entry;
        const store = this.#cacheStore.subStore(
          `${agentKind}/${cacheHash}`,
          app,
        );

        await Promise.all([
          store.writeJson("instruction.json", instruction),
          store.writeJson("response.json", generation),
          store.writeJson("elements.json", elements),
        ]);
      }),
    );

    await this.discard();
  }

  @span("cache.discard", spanAttrs)
  async discard(): Promise<void> {
    this.#actorCache.discard();
    this.#plannerCache.discard();
  }

  @span("cache.clear", spanAttrs)
  async clear(): Promise<void> {
    await this.#cacheStore.clear();
    await this.discard();
  }

  #initiate(
    agentMeta: ElementsCache.AgentMeta,
    request: ServerCache.CacheRequest,
  ): ElementsCache.InitiatedData {
    const cacheKey = this.#cacheKey(agentMeta);
    const cacheHash: ElementsCache.CacheHash = xxh64Str(
      CACHE_VERSION + cacheKey,
    );

    const memoryKey = this.#memoryKey(cacheHash, request);

    return {
      cacheKey,
      cacheHash,
      memoryKey,
    };
  }

  #cacheKey(meta: ElementsCache.AgentMeta): ElementsCache.CacheKey {
    return meta.kind === "planner" ? meta.goal : meta.step;
  }

  #memoryKey(
    cacheHash: ElementsCache.CacheHash,
    request: ServerCache.CacheRequest,
  ): ElementsCache.MemoryKey {
    return `${cacheHash}|${request.model.provider}/${request.model.modelId}|${this.app}` as ElementsCache.MemoryKey;
  }

  #memoryRecord(
    memoryKey: ElementsCache.MemoryKey,
  ): ElementsCache.MemoryRecord | null {
    return (
      this.#actorCache.getRecord(memoryKey) ||
      this.#plannerCache.getRecord(memoryKey)
    );
  }

  #memoryEntries(): ElementsCache.Entries {
    return [
      ...this.#plannerCache.getEntries(),
      ...this.#actorCache.getEntries(),
    ];
  }

  #spanAttrs() {
    return spanAttrs.call(this);
  }
}

function spanAttrs(this: ElementsCache): Tracer.SpansCacheAttrsBase {
  return {
    "app.id": this.app,
    "cache.layer": "elements",
  };
}
