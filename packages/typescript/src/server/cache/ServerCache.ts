import { BaseCache } from "@langchain/core/caches";
import type { Generation } from "@langchain/core/outputs";
import { AppId } from "../../AppId.ts";
import type { Cache } from "../../client/Cache.ts";
import { Lchain } from "../../llm/Lchain.ts";
import type { LchainSchema } from "../../llm/LchainSchema.ts";
import {
  type CacheLookups,
  createCacheLookups,
  createLlmUsage,
  type LlmUsage,
} from "../../llm/llmSchema.ts";
import type { LlmContext } from "../LlmContext.ts";
import type { SessionContext } from "../session/SessionContext.ts";

export abstract class ServerCache extends BaseCache {
  usage: LlmUsage = createLlmUsage();

  /**
   * Lookup counters, used to tell how much of a request was served from the
   * cache. Only the session-level cache (see `CacheFactory`) counts, so the
   * caches nested in a `ChainedCache` keep theirs at zero.
   *
   * NOTE: The object is mutated in place rather than replaced, so that callers
   * accumulating across lookups don't lose counts (as they would with `usage`,
   * which `ChainedCache` replaces on every hit).
   */
  readonly lookups: CacheLookups = createCacheLookups();

  protected sessionContext: SessionContext;

  constructor(sessionContext: SessionContext) {
    super();
    this.sessionContext = sessionContext;
  }

  get app(): AppId {
    return this.sessionContext.app;
  }

  /**
   * Looks up a cache entry for the given prompt and LLM key.
   *
   * @param prompt Serialized prompt string (e.g. "System: You are a...")
   * @param llmKey Serialized LLM configuration (e.g. "_model:\"base_chat_model\",_type:\"openai\"...")
   * @returns Cached LLM generations or null if no cache entry is found.
   */
  async lookup(
    _prompt: LlmContext.Prompt,
    _llmKey: LlmContext.LlmKey,
  ): Promise<Generation[] | null> {
    return null;
  }

  /**
   * Updates the cache with a new entry for the given prompt and LLM key.
   *
   * @param prompt Serialized prompt string (e.g. "System: You are a...")
   * @param llmKey Serialized LLM configuration (e.g. "_model:\"base_chat_model\",_type:\"openai\"...")
   * @param generations LLM generations to store in the cache.
   */
  async update(
    _prompt: LlmContext.Prompt,
    _llmKey: LlmContext.LlmKey,
    _generations: Generation[],
  ): Promise<void> {}

  abstract save(): Promise<void>;

  abstract discard(): Promise<void>;

  abstract clear(props?: Cache.ClearProps): Promise<void>;

  protected countHit(): void {
    this.lookups.hits += 1;
  }

  protected countMiss(): void {
    this.lookups.misses += 1;
  }

  protected applyUsage(
    generationsArg:
      | LchainSchema.StoredGeneration
      | LchainSchema.StoredGeneration[],
  ): void {
    const generations = Array.isArray(generationsArg)
      ? generationsArg
      : [generationsArg];
    generations.forEach((generation) => {
      // TODO: Figure out what models has `usage_metadata` undefined and find a fallback.
      if (generation.message.data.usage_metadata)
        Lchain.applyUsage(this.usage, generation.message.data.usage_metadata);
    });
  }
}
