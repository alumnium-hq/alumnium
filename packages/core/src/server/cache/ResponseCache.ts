import {
  deserializeStoredGeneration,
  serializeGeneration,
} from "@langchain/core/caches";
import type { StoredGeneration } from "@langchain/core/messages";
import type { Generation } from "@langchain/core/outputs";
import { xxh32 } from "smolxxh";
import z from "zod";
import { AppId } from "../../AppId.js";
import { Lchain } from "../../llm/Lchain.js";
import { getLogger } from "../../utils/logger.js";
import { LlmContext } from "../LlmContext.js";
import { SessionContext } from "../session/SessionContext.js";
import { CacheStore } from "./CacheStore.js";
import { ServerCache } from "./ServerCache.js";

const logger = getLogger(import.meta.url);

export namespace ResponseCache {
  export interface MemoryEntry {
    prompt: LlmContext.Prompt;
    llmKey: LlmContext.LlmKey;
    generations: Generation[];
    app: AppId;
  }

  export type RequestHash = z.infer<typeof ResponseCache.RequestHash>;
}

export class ResponseCache extends ServerCache {
  static RequestHash = z.string().brand("ResponseCache.RequestHash");

  readonly #cacheStore: CacheStore;
  #memoryCache: Record<ResponseCache.RequestHash, ResponseCache.MemoryEntry> =
    {};

  constructor(sessionContext: SessionContext, cacheStore: CacheStore) {
    super(sessionContext);
    this.#cacheStore = cacheStore.subStore("responses");
  }

  override async lookup(
    prompt: LlmContext.Prompt,
    llmKey: LlmContext.LlmKey,
  ): Promise<Generation[] | null> {
    try {
      const requestHash = this.#hashRequest(prompt, llmKey);

      const memoryEntry = this.#memoryCache[requestHash];
      if (memoryEntry) {
        logger.debug(
          `Cache hit (in-memory) for prompt: "${prompt.slice(0, 100)}..."`,
        );
        this.#updateUsage(memoryEntry.generations);
        return memoryEntry.generations;
      }

      const entryStore = this.#cacheStore.subStore(requestHash);

      const storedGenerations =
        await entryStore.readJson<StoredGeneration[]>("response.json");
      if (!storedGenerations) return null;
      const generations = storedGenerations.map(deserializeStoredGeneration);

      logger.debug(`Cache hit (file) for prompt: "${prompt.slice(0, 100)}..."`);

      // TODO: In the original implementation the file cache is also saved to
      // memory cache on lookup. This cause memory leak as the memory cache is
      // never cleared. If we want to optimize cache for faster lookup, we
      // should implement a proper cache eviction strategy instead of saving
      // everything to memory cache.

      this.#updateUsage(generations);
      return generations;
    } catch (error) {
      logger.warn(`Error occurred while looking up cache: ${error}`);
      return null;
    }
  }

  override async update(
    prompt: LlmContext.Prompt,
    llmKey: LlmContext.LlmKey,
    generations: Generation[],
  ): Promise<void> {
    const requestHash = this.#hashRequest(prompt, llmKey);
    this.#memoryCache[requestHash] = {
      prompt,
      llmKey,
      generations,
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
        const storedGenerations = generations.map(serializeGeneration);
        const entryStore = this.#cacheStore.subStore(hash, app);

        await Promise.all([
          entryStore.writeJson("response.json", storedGenerations),
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

  #hashRequest(
    prompt: LlmContext.Prompt,
    llmKey: LlmContext.LlmKey,
  ): ResponseCache.RequestHash {
    const str = [this.app, prompt, llmKey].join("|");
    return xxh32(Buffer.from(str, "utf8")).toString(
      16,
    ) as ResponseCache.RequestHash;
  }

  #updateUsage(generations: Generation[]): void {
    for (const generation of generations) {
      try {
        const usageMetadata =
          Lchain.Generation.parse(generation).message?.usage_metadata;
        this.usage.input_tokens += usageMetadata?.input_tokens ?? 0;
        this.usage.output_tokens += usageMetadata?.output_tokens ?? 0;
        this.usage.total_tokens += usageMetadata?.total_tokens ?? 0;
      } catch (error) {
        logger.warn(
          `Failed to parse generation for usage metadata: ${JSON.stringify(
            generation,
          )}. Error: ${error}`,
        );
      }
    }
  }
}
