import type { Generation } from "@langchain/core/outputs";
import { canonize } from "smolcanon";
import { xxh64Str } from "smolxxh/str";
import z from "zod";
import { AppId } from "../../AppId.ts";
import { Lchain } from "../../llm/Lchain.ts";
import { getLogger } from "../../utils/logger.ts";
import type { Agent } from "../agents/Agent.ts";
import { LlmContext } from "../LlmContext.ts";
import { SessionContext } from "../session/SessionContext.ts";
import { CacheStore } from "./CacheStore.ts";
import { ServerCache } from "./ServerCache.ts";

const logger = getLogger(import.meta.url);

const CACHE_VERSION = "v1";

export namespace ResponseCache {
  export interface MemoryEntry {
    prompt: LlmContext.Prompt;
    llmKey: LlmContext.LlmKey;
    generations: Lchain.StoredGeneration[];
    app: AppId;
  }

  export type RequestHash = z.infer<typeof ResponseCache.RequestHash>;

  export interface InitiatedData {
    meta: Agent.Meta;
    requestHash: RequestHash;
  }
}

export class ResponseCache extends ServerCache {
  static RequestHash = z.string().brand("ResponseCache.RequestHash");

  readonly #cacheStore: CacheStore;
  readonly #llmContext: LlmContext;
  #memoryCache: Record<ResponseCache.RequestHash, ResponseCache.MemoryEntry> =
    {};

  constructor(
    sessionContext: SessionContext,
    cacheStore: CacheStore,
    llmContext: LlmContext,
  ) {
    super(sessionContext);
    this.#cacheStore = cacheStore.subStore("responses");
    this.#llmContext = llmContext;
  }

  override async lookup(
    prompt: LlmContext.Prompt,
    llmKey: LlmContext.LlmKey,
  ): Promise<Generation[] | null> {
    const initiatedData = this.#initiate(prompt, llmKey);
    if (!initiatedData) return null;
    const { requestHash } = initiatedData;

    try {
      const memoryEntry = this.#memoryCache[requestHash];
      if (memoryEntry) {
        logger.debug(
          `Cache hit (in-memory) for prompt: "${prompt.slice(0, 100)}..."`,
        );
        this.#updateUsage(memoryEntry.generations);
        return memoryEntry.generations.map(Lchain.fromStored);
      }

      const entryStore = this.#cacheStore.subStore(requestHash);

      const storedGenerations =
        await entryStore.readJson<Lchain.StoredGeneration[]>("response.json");
      if (!storedGenerations) return null;

      logger.debug(
        `Cache hit (file) for prompt: "${prompt.slice(0, 100)}...":`,
      );

      this.#updateUsage(storedGenerations);

      return storedGenerations.map(Lchain.fromStored);
    } catch (error) {
      logger.warn(`Error occurred while looking up cache: {error}`, { error });
      return null;
    }
  }

  override async update(
    prompt: LlmContext.Prompt,
    llmKey: LlmContext.LlmKey,
    generations: Generation[],
  ): Promise<void> {
    const initiatedData = this.#initiate(prompt, llmKey);
    if (!initiatedData) return;
    const { requestHash } = initiatedData;

    const storedGenerations = generations.map(Lchain.toStored);
    this.#memoryCache[requestHash] = {
      prompt,
      llmKey,
      generations: storedGenerations,
      app: this.app,
    };
  }

  async save(): Promise<void> {
    const entries = Object.entries(this.#memoryCache);
    if (!entries.length) return;

    logger.debug(`Saving ${entries.length} response cache entries...`);

    await Promise.all(
      entries.map(async ([hash, entry]) => {
        const { prompt, llmKey, generations, app } = entry;
        const entryStore = this.#cacheStore.subStore(hash, app);

        await Promise.all([
          entryStore.writeJson("response.json", generations),
          entryStore.writeJson("request.json", { prompt, llmKey, app }),
        ]);
      }),
    );

    await this.discard();
  }

  async discard(): Promise<void> {
    this.#memoryCache = {};
  }

  async clear(): Promise<void> {
    await this.#cacheStore.clear();
    await this.discard();
  }

  #initiate(
    prompt: LlmContext.Prompt,
    llmKey: LlmContext.LlmKey,
  ): ResponseCache.InitiatedData | null {
    const agentMeta = this.#llmContext.getPromptMeta(prompt);
    if (!agentMeta) {
      logger.warn(
        `No metadata found, skipping request cache lookup for prompt: "${prompt.slice(0, 100)}"...`,
      );
      return null;
    }
    const requestHash = this.#hashRequest(prompt, llmKey, agentMeta);

    return {
      meta: agentMeta,
      requestHash,
    };
  }

  #hashRequest(
    prompt: LlmContext.Prompt,
    llmKey: LlmContext.LlmKey,
    agentMeta: Agent.Meta,
  ): ResponseCache.RequestHash {
    const metaCanon = canonize(agentMeta);
    const str = [CACHE_VERSION, this.app, prompt, llmKey, metaCanon].join("|");
    return xxh64Str(str);
  }

  #updateUsage(generations: Lchain.StoredGeneration[]): void {
    for (const generation of generations) {
      const usageMetadata = generation?.message?.data.usage_metadata;
      this.usage.input_tokens += usageMetadata?.input_tokens ?? 0;
      this.usage.output_tokens += usageMetadata?.output_tokens ?? 0;
      this.usage.total_tokens += usageMetadata?.total_tokens ?? 0;
    }
  }
}
