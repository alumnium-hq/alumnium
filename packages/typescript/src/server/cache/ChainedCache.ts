import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { Telemetry } from "../../telemetry/Telemetry.ts";
import type { Tracer } from "../../telemetry/Tracer.ts";
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
    request: ServerCache.CacheRequest,
  ): Promise<LanguageModelV4GenerateResult | null> {
    for (const [index, cache] of this.caches.entries()) {
      const result = await cache.lookup(request);
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
    request: ServerCache.CacheRequest,
    result: LanguageModelV4GenerateResult,
  ): Promise<void> {
    await Promise.all(
      this.caches.map((cache) => cache.update(request, result)),
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
