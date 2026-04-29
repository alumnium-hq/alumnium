import type { Generation } from "@langchain/core/outputs";
import { Telemetry } from "../../telemetry/Telemetry.ts";
import type { Tracer } from "../../telemetry/Tracer.ts";
import { LlmContext } from "../LlmContext.ts";
import { SessionContext } from "../session/SessionContext.ts";
import { ServerCache } from "./ServerCache.ts";

const { logger, tracer } = Telemetry.get(import.meta.url);

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
    return tracer.span("cache.lookup", this.#spanAttrs(), async (span) => {
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
    });
  }

  override async update(
    prompt: LlmContext.Prompt,
    llmString: LlmContext.LlmKey,
    generations: Generation[],
  ): Promise<void> {
    return tracer.span("cache.update", this.#spanAttrs(), async () =>
      Promise.all(
        this.caches.map((cache) =>
          cache.update(prompt, llmString, generations),
        ),
      ).then(() => undefined),
    );
  }

  async save(): Promise<void> {
    return tracer.span("cache.save", this.#spanAttrs(), async () => {
      await Promise.all(this.caches.map((cache) => cache.save()));
    });
  }

  async discard(): Promise<void> {
    return tracer.span("cache.discard", this.#spanAttrs(), async () => {
      await Promise.all(this.caches.map((cache) => cache.discard()));
    });
  }

  async clear(props: Record<string, unknown> = {}): Promise<void> {
    return tracer.span("cache.clear", this.#spanAttrs(), async () => {
      await Promise.all(this.caches.map((cache) => cache.clear(props)));
    });
  }

  #spanAttrs(): Tracer.SpansCacheAttrsBase {
    return {
      "app.id": this.app,
      "cache.layer": "chained",
    };
  }
}
