import type { Generation } from "@langchain/core/outputs";
import { Telemetry } from "../../telemetry/Telemetry.ts";
import type { Tracer } from "../../telemetry/Tracer.ts";
import { LlmContext } from "../LlmContext.ts";
import { SessionContext } from "../session/SessionContext.ts";
import { ServerCache } from "./ServerCache.ts";

const { logger, tracer } = Telemetry.get(import.meta.url);
const { span } = tracer.dec();

export class ChainedCache extends ServerCache {
  caches: ServerCache[];

  constructor(sessionContext: SessionContext, caches: ServerCache[]) {
    super(sessionContext);
    this.caches = caches;
  }

  @span("cache.lookup", spanAttrs)
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

  @span("cache.update", spanAttrs)
  override async update(
    prompt: LlmContext.Prompt,
    llmString: LlmContext.LlmKey,
    generations: Generation[],
  ): Promise<void> {
    await Promise.all(
      this.caches.map((cache) => cache.update(prompt, llmString, generations)),
    );
  }

  @span("cache.save", spanAttrs)
  async save(): Promise<void> {
    await Promise.all(this.caches.map((cache) => cache.save()));
  }

  @span("cache.discard", spanAttrs)
  async discard(): Promise<void> {
    await Promise.all(this.caches.map((cache) => cache.discard()));
  }

  @span("cache.clear", spanAttrs)
  async clear(props: Record<string, unknown> = {}): Promise<void> {
    await Promise.all(this.caches.map((cache) => cache.clear(props)));
  }
}

function spanAttrs(this: ChainedCache): Tracer.SpansCacheAttrsBase {
  return {
    "app.id": this.app,
    "cache.layer": "chained",
  };
}
