import type { Generation } from "@langchain/core/outputs";
import fs from "node:fs/promises";
// @ts-expect-error -- npm-fuzzy has broken ESM+TS support, so we import ESM version directly
import * as fuzzy from "npm-fuzzy/dist/index.esm.js";
import { xxh32 } from "smolxxh";
import z from "zod";
import { AppId } from "../../../AppId.js";
import { Lchain } from "../../../llm/Lchain.js";
import { getLogger } from "../../../utils/logger.js";
import { ActorAgent } from "../../agents/ActorAgent.js";
import { PlannerAgent } from "../../agents/PlannerAgent.js";
import { LlmContext } from "../../LlmContext.js";
import { SessionContext } from "../../session/SessionContext.js";
import { CacheStore } from "../CacheStore.js";
import { ServerCache } from "../ServerCache.js";
import { ActorAgentElementsCache } from "./ActorAgentElementsCache.js";
import { ElementsCacheMask } from "./ElementsCacheMask.js";
import { ElementsCacheTree } from "./ElementsCacheTree.js";
import { PlannerAgentElementsCache } from "./PlannerAgentElementsCache.js";

// NOTE: See `npm-fuzze` import above
const tokenSortRatio =
  fuzzy.tokenSortRatio as typeof import("npm-fuzzy").tokenSortRatio;
const tokenSetRatio =
  fuzzy.tokenSetRatio as typeof import("npm-fuzzy").tokenSetRatio;

const logger = getLogger(import.meta.url);

const FUZZY_MATCH_THRESHOLD = 95;

export namespace ElementsCache {
  export type MemoryCache = Record<MemoryKey, MemoryRecord>;

  export interface MemoryRecord {
    cacheHash: CacheHash;
    generation: Lchain.StoredGeneration;
    elements: Elements;
    agentType: AgentType;
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

  export type AgentType = AgentMeta["type"];

  export type CacheHash = z.infer<typeof ElementsCache.CacheHash>;

  export type CacheKey = z.infer<typeof ElementsCache.CacheKey>;

  export type MemoryKey = z.infer<typeof ElementsCache.MemoryKey>;

  export interface InitiatedData {
    meta: AgentMeta;
    cacheKey: CacheKey;
    cacheHash: CacheHash;
    memoryKey: MemoryKey;
  }

  export type Entries = [ElementsCache.MemoryKey, ElementsCache.MemoryRecord][];
}

export class ElementsCache extends ServerCache {
  static Element = z.record(z.string(), z.union([z.string(), z.number()]));

  static Elements = z.array(ElementsCache.Element);

  static Instruction = z.record(z.string(), z.string());

  static CacheHash = z.string().brand("ElementsCache.RequestHash");

  static CacheKey = z.string().brand("ElementsCache.CacheKey");

  static MemoryKey = z.string().brand("ElementsCache.MemoryKey");

  readonly #cacheStore: CacheStore;
  readonly #llmContext: LlmContext;
  #plannerCache: PlannerAgentElementsCache;
  #actorCache: ActorAgentElementsCache;

  constructor(
    sessionContext: SessionContext,
    cacheStore: CacheStore,
    llmContext: LlmContext,
  ) {
    super(sessionContext);
    this.#cacheStore = cacheStore.subStore("elements");
    this.#llmContext = llmContext;
    this.#plannerCache = new PlannerAgentElementsCache(sessionContext);
    this.#actorCache = new ActorAgentElementsCache({
      plannerCache: this.#plannerCache,
      sessionContext,
    });
  }

  /**
   * Look up cached response if elements are still valid.
   *
   * Process:
   * 1. Parse prompt to extract goal/step and accessibility_tree
   * 2. Determine agent type (planner vs actor)
   * 3. Hash goal/step to get cache key
   * 4. Load elements.json
   * 5. Resolve all elements to current IDs in tree
   * 6. If valid, unmask and return cached response
   *
   * @param prompt Serialized prompt string (e.g. "System: You are a...")
   * @param llmKey Serialized LLM configuration (e.g. "_model:\"base_chat_model\",_type:\"openai\"...")
   * @returns Cached response if elements are valid, null otherwise.
   */
  override async lookup(
    prompt: LlmContext.Prompt,
    llmKey: LlmContext.LlmKey,
  ): Promise<Generation[] | null> {
    try {
      const data = this.#initiate(prompt, llmKey);
      if (!data) return null;
      const { meta: agentMeta, cacheKey, cacheHash, memoryKey } = data;

      const tree = new ElementsCacheTree(data.meta.treeXml);

      let resolvedMemoryKey = memoryKey;

      if (!this.#memoryRecord(memoryKey)) {
        const fuzzyMemoryKey = this.#fuzzyMemoryLookup(
          agentMeta.type,
          cacheKey,
        );
        if (fuzzyMemoryKey) {
          resolvedMemoryKey = fuzzyMemoryKey as ElementsCache.MemoryKey;
        }
      }

      const memoryEntry = this.#memoryRecord(resolvedMemoryKey);
      if (memoryEntry) {
        const masksIdsMap = tree.resolveElements(memoryEntry.elements);

        if (masksIdsMap) {
          const unmaskedGeneration = ElementsCacheMask.unmask(
            memoryEntry.generation,
            masksIdsMap,
          );
          this.#updateUsage(unmaskedGeneration);

          const generation = Lchain.fromStored(unmaskedGeneration);
          logger.debug(
            `Elements cache hit (in-memory) for ${agentMeta.type}: "${cacheKey.slice(0, 50)}..."`,
          );
          return [generation];
        }
      }

      const cacheStore = this.#cacheStore.subStore(
        `${agentMeta.type}/${cacheHash}`,
      );

      let [elements, maskedGeneration] = await Promise.all([
        cacheStore.readJson("elements.json", ElementsCache.Elements),
        cacheStore.readJson("response.json", Lchain.StoredGeneration),
      ]);

      if (!elements || !maskedGeneration) {
        const fuzzyHash = await this.#fuzzyLookupHash(agentMeta.type, cacheKey);
        if (!fuzzyHash) return null;

        const fuzzyStore = this.#cacheStore.subStore(
          `${agentMeta.type}/${fuzzyHash}`,
        );

        const [fuzzyElements, fuzzyResponse] = await Promise.all([
          fuzzyStore.readJson("elements.json", ElementsCache.Elements),
          fuzzyStore.readJson("response.json", Lchain.StoredGeneration),
        ]);

        if (!fuzzyElements || !fuzzyResponse) return null;

        elements = fuzzyElements;
        maskedGeneration = fuzzyResponse;
      }

      const masksIdsMap = tree.resolveElements(elements);
      if (!masksIdsMap) {
        logger.debug(
          `Elements cache miss (resolution failed) for ${agentMeta.type}: "${cacheKey.slice(0, 50)}..."`,
        );
        return null;
      }

      const unmaskedGeneration = ElementsCacheMask.unmask(
        maskedGeneration,
        masksIdsMap,
      );

      this.#updateUsage(unmaskedGeneration);

      const generation = Lchain.fromStored(unmaskedGeneration);
      logger.debug(
        `Elements cache hit (file) for ${agentMeta.type}: "${cacheKey.slice(0, 50)}..."`,
      );
      return [generation];
    } catch (error) {
      logger.debug(`Error in elements cache lookup: ${error}`);
      return null;
    }
  }

  override async update(
    prompt: LlmContext.Prompt,
    llmKey: LlmContext.LlmKey,
    generations: Generation[],
  ): Promise<void> {
    try {
      const data = this.#initiate(prompt, llmKey);
      if (!data) {
        logger.debug(
          `Prompt is not eligible for elements caching: "${prompt.slice(0, 100)}"`,
        );
        return;
      }
      const { meta, cacheHash, memoryKey } = data;

      const [firstGeneration] = generations as Lchain.GenerationsSingle;
      const generation = Lchain.toStored(firstGeneration);

      switch (meta.type) {
        case "planner":
          return this.#plannerCache.update({
            cacheHash,
            memoryKey,
            generation,
            meta,
          });

        case "actor":
          return this.#actorCache.update({
            cacheHash,
            memoryKey,
            generation,
            meta,
          });

        default:
          meta satisfies never;
      }
    } catch (error) {
      logger.warn(`Error in elements cache update: ${error}`);
    }
  }

  async save(): Promise<void> {
    const entries = this.#memoryEntries();
    if (!entries.length) return;

    logger.debug(`Saving ${entries.length} elements cache entries`);

    await Promise.all(
      entries.map(async ([_, entry]) => {
        const { cacheHash, app, agentType, instruction, generation, elements } =
          entry;
        const store = this.#cacheStore.subStore(
          `${agentType}/${cacheHash}`,
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

  async discard(): Promise<void> {
    this.#actorCache.discard();
    this.#plannerCache.discard();
  }

  async clear(): Promise<void> {
    await this.#cacheStore.clear();
    await this.discard();
  }

  #initiate(
    prompt: LlmContext.Prompt,
    llmKey: LlmContext.LlmKey,
  ): ElementsCache.InitiatedData | null {
    const agentMeta = this.#llmContext.getPromptMeta(prompt);
    if (!agentMeta) {
      logger.warn(
        `No metadata found, skipping elements cache lookup for prompt: "${prompt.slice(0, 100)}"...`,
      );
      return null;
    }

    if (agentMeta.type !== "actor" && agentMeta.type !== "planner") return null;

    const cacheKey = this.#cacheKey(agentMeta);
    const cacheHash = this.#cacheHash(cacheKey);

    const memoryKey = this.#memoryKey(cacheHash, llmKey);

    return {
      meta: agentMeta,
      cacheKey,
      cacheHash,
      memoryKey,
    };
  }

  #cacheKey(meta: ElementsCache.AgentMeta): ElementsCache.CacheKey {
    return (
      meta.type === "planner" ? meta.goal : meta.step
    ) as ElementsCache.CacheKey;
  }

  #cacheHash(value: ElementsCache.CacheKey): ElementsCache.CacheHash {
    return xxh32(Buffer.from(value, "utf8")).toString(
      16,
    ) as ElementsCache.CacheHash;
  }

  #memoryKey(
    cacheHash: ElementsCache.CacheHash,
    llmKey: LlmContext.LlmKey,
  ): ElementsCache.MemoryKey {
    return `${cacheHash}|${llmKey}|${this.app}` as ElementsCache.MemoryKey;
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

  //#region Fuzzy lookup

  #fuzzyMemoryLookup(
    agentType: ElementsCache.AgentType,
    cacheKey: ElementsCache.CacheKey,
  ): ElementsCache.MemoryKey | null {
    const keyField = agentType === "planner" ? "goal" : "step";
    let bestKey: ElementsCache.MemoryKey | null = null;
    let bestScore = 0;

    for (const [memoryKey, entry] of this.#memoryEntries()) {
      if (entry.agentType !== agentType || entry.app !== this.app) continue;

      const entryCacheKey = entry.instruction[keyField] ?? "";
      if (!entryCacheKey) {
        continue;
      }

      const score = Math.max(
        tokenSortRatio(cacheKey, entryCacheKey),
        tokenSetRatio(cacheKey, entryCacheKey),
      );

      if (score > bestScore) {
        bestScore = score;
        bestKey = memoryKey;
      }
    }

    if (bestScore >= FUZZY_MATCH_THRESHOLD) {
      logger.debug(
        `Fuzzy cache match (in-memory, ${Math.round(bestScore)}%) for ${agentType}: "${cacheKey.slice(0, 50)}..."`,
      );
      return bestKey;
    }

    return null;
  }

  async #fuzzyLookupHash(
    agentType: ElementsCache.AgentType,
    cacheKey: ElementsCache.CacheKey,
  ): Promise<ElementsCache.CacheHash | null> {
    const keyField = agentType === "planner" ? "goal" : "step";
    let bestHash: ElementsCache.CacheHash | null = null;
    let bestScore = 0;

    const dir = this.#cacheStore.resolve(agentType);

    const entries = await fs
      .readdir(dir, { withFileTypes: true })
      .catch(() => []);

    await Promise.all(
      entries.map(async (entry) => {
        if (!entry.isDirectory) return;

        const entryStore = this.#cacheStore.subStore(
          `${agentType}/${entry.name}`,
        );
        const instruction = await entryStore.readJson(
          "instruction.json",
          ElementsCache.Instruction,
        );
        if (!instruction) return;

        const entryCacheKey = instruction[keyField];
        if (!entryCacheKey) return;

        const score = Math.max(
          tokenSortRatio(cacheKey, entryCacheKey),
          tokenSetRatio(cacheKey, entryCacheKey),
        );

        if (score > bestScore) {
          bestScore = score;
          bestHash = entry.name as ElementsCache.CacheHash;
        }
      }),
    );

    if (bestScore >= FUZZY_MATCH_THRESHOLD) {
      logger.debug(
        `Fuzzy cache match (${Math.round(bestScore)}%) for ${agentType}: "${cacheKey.slice(0, 50)}..."`,
      );
      return bestHash;
    }

    logger.debug(
      `No fuzzy cache match (best: ${Math.round(bestScore)}%) above threshold for ${agentType}: "${cacheKey.slice(0, 50)}..."`,
    );
    return null;
  }

  //#endregion

  #updateUsage(generation: Lchain.StoredGeneration): void {
    const usageMetadata = generation?.message?.data.usage_metadata;
    this.usage.input_tokens += usageMetadata?.input_tokens ?? 0;
    this.usage.output_tokens += usageMetadata?.output_tokens ?? 0;
    this.usage.total_tokens += usageMetadata?.total_tokens ?? 0;
  }
}
