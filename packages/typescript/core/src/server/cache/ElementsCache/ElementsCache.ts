import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { xxh64Str } from "@js-fns/xxhash/str";
import z from "zod";
import { AppId } from "../../../AppId.ts";
import { AiSdk } from "../../../llm/AiSdk.ts";
import { Params } from "../../../Params.ts";
import { Telemetry } from "../../../telemetry/Telemetry.ts";
import type { Tracer } from "../../../telemetry/Tracer.ts";
import { ActorAgent } from "../../agents/ActorAgent.ts";
import type { BaseAgent } from "../../agents/BaseAgent.ts";
import type { LocatorAgent } from "../../agents/LocatorAgent.ts";
import { PlannerAgent } from "../../agents/PlannerAgent.ts";
import { SessionContext } from "../../session/SessionContext.ts";
import { CacheStore } from "../CacheStore.ts";
import { ServerCache } from "../ServerCache.ts";
import { ActorAgentElementsCache } from "./ActorAgentElementsCache.ts";
import { ElementsCacheMask } from "./ElementsCacheMask.ts";
import { ElementsCacheTree } from "./ElementsCacheTree.ts";
import { LocatorAgentElementsCache } from "./LocatorAgentElementsCache.ts";
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

  export type AgentMeta =
    | PlannerAgent.Meta
    | ActorAgent.Meta
    | LocatorAgent.Meta;

  export type EligibleAgentKind = AgentMeta["kind"];

  export type CacheHash = z.infer<typeof ElementsCache.CacheHash>;

  export type CacheKey =
    | BaseAgent.Goal
    | BaseAgent.Step
    | LocatorAgent.Meta["description"];

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
  #locatorCache: LocatorAgentElementsCache;

  constructor(sessionContext: SessionContext, cacheStore: CacheStore) {
    super(sessionContext);
    this.#cacheStore = cacheStore.subStore("elements");
    this.#plannerCache = new PlannerAgentElementsCache(sessionContext);
    this.#actorCache = new ActorAgentElementsCache({
      plannerCache: this.#plannerCache,
      sessionContext,
    });
    this.#locatorCache = new LocatorAgentElementsCache(sessionContext);
  }

  override async lookup(
    request: ServerCache.CacheRequest,
  ): Promise<LanguageModelV4GenerateResult | null> {
    return tracer.span("cache.lookup", this.#spanAttrs(), async (span) => {
      const agentMeta = request.meta;

      if (!this.#isEligible(agentMeta) || this.#hasScreenshot(request)) {
        logger.debug(
          `Request for agent "${agentMeta.kind}" is not eligible for elements caching`,
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

      const params = "params" in agentMeta ? agentMeta.params : undefined;
      const substitute = (elements: ElementsCache.Elements) =>
        elements.map((element) =>
          Params.mapStrings(element, (value) =>
            Params.substitute(value, params),
          ),
        );

      try {
        const tree = new ElementsCacheTree(agentMeta.treeXml);

        const memoryEntry = this.#memoryRecord(agentMeta.kind, memoryKey);
        if (
          memoryEntry &&
          !this.#isStaleEmptyPlan(agentMeta, memoryEntry.generation)
        ) {
          const masksIdsMap = tree.resolveElements(
            substitute(memoryEntry.elements),
          );

          if (masksIdsMap) {
            const unmaskedGeneration = ElementsCacheMask.unmask(
              memoryEntry.generation,
              masksIdsMap,
              params,
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
        if (this.#isStaleEmptyPlan(agentMeta, hydratedGeneration)) {
          logger.debug(
            `Elements cache miss (empty plan) for ${agentMeta.kind}: "${cacheKey.slice(0, 50)}..."`,
          );
          span.event("cache.lookup.miss", {
            ...this.#spanAttrs(),
            "agent.kind": agentMeta.kind,
            "cache.hash": cacheHash,
            "cache.lookup.miss.reason": "empty_plan",
          });

          return null;
        }

        const masksIdsMap = tree.resolveElements(substitute(elements));
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
          params,
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

        if (!this.#isEligible(agentMeta) || this.#hasScreenshot(request)) {
          logger.debug(
            `Request for agent "${agentMeta.kind}" is not eligible for elements caching`,
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

          case "locator":
            return this.#locatorCache.update({
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
      entries.map(async ([_key, entry]) => {
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
    this.#locatorCache.discard();
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
    switch (meta.kind) {
      case "planner":
        return meta.goal;

      case "actor":
        return meta.step;

      case "locator":
        return meta.description;

      default:
        return meta satisfies never;
    }
  }

  #isEligible(
    meta: ServerCache.CacheRequest["meta"],
  ): meta is ElementsCache.AgentMeta {
    return (
      meta.kind === "planner" ||
      meta.kind === "actor" ||
      meta.kind === "locator"
    );
  }

  #memoryKey(
    cacheHash: ElementsCache.CacheHash,
    request: ServerCache.CacheRequest,
  ): ElementsCache.MemoryKey {
    return `${cacheHash}|${request.model.provider}/${request.model.modelId}|${this.app}` as ElementsCache.MemoryKey;
  }

  /** Entries written before empty plans were excluded from the cache must not be replayed. */
  #isStaleEmptyPlan(
    agentMeta: ElementsCache.AgentMeta,
    generation: LanguageModelV4GenerateResult,
  ): boolean {
    return (
      agentMeta.kind === "planner" &&
      !PlannerAgentElementsCache.isCacheable(generation)
    );
  }

  /** Goals, steps and descriptions can share text, so records are only looked up in the requesting agent's cache. */
  #memoryRecord(
    agentKind: ElementsCache.EligibleAgentKind,
    memoryKey: ElementsCache.MemoryKey,
  ): ElementsCache.MemoryRecord | null {
    switch (agentKind) {
      case "planner":
        return this.#plannerCache.getRecord(memoryKey);

      case "actor":
        return this.#actorCache.getRecord(memoryKey);

      case "locator":
        return this.#locatorCache.getRecord(memoryKey);

      default:
        agentKind satisfies never;
        return null;
    }
  }

  #memoryEntries(): ElementsCache.Entries {
    return [
      ...this.#plannerCache.getEntries(),
      ...this.#actorCache.getEntries(),
      ...this.#locatorCache.getEntries(),
    ];
  }

  #spanAttrs() {
    return spanAttrs.call(this);
  }

  #hasScreenshot(request: ServerCache.CacheRequest): boolean {
    return request.params.prompt.some(
      (message) =>
        message.role === "user" &&
        message.content.some(
          (part) => part.type === "file" && part.mediaType.startsWith("image/"),
        ),
    );
  }
}

function spanAttrs(this: ElementsCache): Tracer.SpansCacheAttrsBase {
  return {
    "app.id": this.app,
    "cache.layer": "elements",
  };
}
