import z from "zod";
import type { Model } from "../Model.ts";
import type { Agent } from "./agents/Agent.ts";

export namespace LlmContext {
  export type Meta = Agent.Meta;

  export type Prompt = z.infer<typeof LlmContext.Prompt>;

  export type LlmKey = z.infer<typeof LlmContext.LlmKey>;
}

export class LlmContext {
  static Prompt = z.string().brand("LlmContext.Prompt");

  static LlmKey = z.string().brand("LlmContext.LlmKey");

  readonly model: Model;

  constructor(model: Model) {
    this.model = model;
  }

  #promptsMeta: Record<string, LlmContext.Meta> = {};

  #promptsNoCache = new Set<string>();

  assignPromptsMeta(prompts: string[], meta: LlmContext.Meta) {
    for (const prompt of prompts) {
      this.#promptsMeta[prompt] = meta;
    }
  }

  clearPromptsMeta(prompts: string[]) {
    for (const prompt of prompts) {
      delete this.#promptsMeta[prompt];
    }
  }

  getPromptMeta(prompt: string): LlmContext.Meta | undefined {
    return this.#promptsMeta[prompt];
  }

  /**
   * Marks prompts whose response must be generated afresh, skipping both the
   * cache lookup and the cache update.
   *
   * NOTE: A marker here rather than a field of `LlmContext.Meta`: meta is hashed
   * into the cache key (see `ResponseCache`), so a flag there would give a
   * bypassed request a key of its own - missing every existing entry, and then
   * writing a second one next to it.
   *
   * NOTE: Keyed by prompt and shared across the session, like `#promptsMeta`
   * above. Two requests carrying the identical prompt and disagreeing about the
   * cache would therefore step on each other - which no caller does today, since
   * the one that bypasses is a scenario playback and a playback runs its steps
   * one at a time.
   *
   * @param prompts - Prompts to bypass the cache for.
   */
  assignPromptsNoCache(prompts: string[]) {
    for (const prompt of prompts) {
      this.#promptsNoCache.add(prompt);
    }
  }

  /**
   * Unmarks prompts marked by `assignPromptsNoCache`.
   *
   * NOTE: Must run however the request ended, see `BaseAgent.invokeChain`. A
   * marker left behind disables caching for that prompt for the rest of the
   * session, which nothing reports and nothing fails on.
   *
   * @param prompts - Prompts to stop bypassing the cache for.
   */
  clearPromptsNoCache(prompts: string[]) {
    for (const prompt of prompts) {
      this.#promptsNoCache.delete(prompt);
    }
  }

  /**
   * @param prompt - Prompt to check.
   * @returns Whether the prompt is to bypass the cache.
   */
  isPromptNoCache(prompt: string): boolean {
    return this.#promptsNoCache.has(prompt);
  }
}
