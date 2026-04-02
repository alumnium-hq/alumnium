import type { Generation } from "@langchain/core/outputs";
import { getLogger } from "../../utils/logger.ts";
import { LlmContext } from "../LlmContext.ts";
import { SessionContext } from "../session/SessionContext.ts";
import { ServerCache } from "./ServerCache.ts";

const logger = getLogger(import.meta.url);

export class ChainedCache extends ServerCache {
  caches: ServerCache[];

  constructor(sessionContext: SessionContext, caches: ServerCache[]) {
    super(sessionContext);
    this.caches = caches;
  }

  override async lookup(
    prompt: LlmContext.Prompt,
    llmString: LlmContext.LlmKey,
  ): Promise<Generation[] | null> {
    for (const [index, cache] of this.caches.entries()) {
      const result = await cache.lookup(prompt, llmString);
      if (result !== null) {
        logger.debug(
          `Cache hit in ${cache.constructor.name} (position ${index})`,
        );
        this.usage = { ...cache.usage };
        return result;
      }
    }

    logger.debug("Cache miss in all chained caches");
    return null;
  }

  override async update(
    prompt: LlmContext.Prompt,
    llmString: LlmContext.LlmKey,
    generations: Generation[],
  ): Promise<void> {
    await Promise.all(
      this.caches.map((cache) => cache.update(prompt, llmString, generations)),
    );
  }

  async save(): Promise<void> {
    await Promise.all(this.caches.map((cache) => cache.save()));
  }

  async discard(): Promise<void> {
    await Promise.all(this.caches.map((cache) => cache.discard()));
  }

  async clear(props: Record<string, unknown> = {}): Promise<void> {
    await Promise.all(this.caches.map((cache) => cache.clear(props)));
  }
}
