import { BaseCache } from "@langchain/core/caches";
import type { Generation } from "@langchain/core/outputs";
import { AppId } from "../../AppId.js";
import type { Cache } from "../../client/Cache.js";
import { createLlmUsage, type LlmUsage } from "../../llm/llmSchema.js";
import type { LlmContext } from "../LlmContext.js";
import type { SessionContext } from "../session/SessionContext.js";

export abstract class ServerCache extends BaseCache {
  usage: LlmUsage = createLlmUsage();
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
    prompt: LlmContext.Prompt,
    llmKey: LlmContext.LlmKey,
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
    prompt: LlmContext.Prompt,
    llmKey: LlmContext.LlmKey,
    generations: Generation[],
  ): Promise<void> {}

  abstract save(): Promise<void>;

  abstract discard(): Promise<void>;

  abstract clear(props?: Cache.ClearProps | undefined): Promise<void>;
}
