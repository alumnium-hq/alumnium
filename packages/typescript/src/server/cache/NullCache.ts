import type { Generation } from "@langchain/core/outputs";
import { Tracer } from "../../telemetry/Tracer.ts";
import { LlmContext } from "../LlmContext.ts";
import { ServerCache } from "./ServerCache.ts";

const tracer = Tracer.get(import.meta.url);

export class NullCache extends ServerCache {
  override async lookup(
    _prompt: LlmContext.Prompt,
    _llmKey: LlmContext.LlmKey,
  ): Promise<Generation[] | null> {
    return tracer.span("cache.lookup", this.#spanAttrs(), (span) => {
      span.event("cache.lookup.miss", {
        ...this.#spanAttrs(),
        "cache.lookup.miss.reason": "unimplemented",
      });
      return null;
    });
  }

  override async update(
    _prompt: LlmContext.Prompt,
    _llmKey: LlmContext.LlmKey,
    _generations: Generation[],
  ): Promise<void> {
    return tracer.span("cache.update", this.#spanAttrs(), (span) => {
      span.event("cache.update.skip", {
        ...this.#spanAttrs(),
        "cache.update.skip.reason": "unimplemented",
      });
    });
  }

  async save(): Promise<void> {
    return tracer.span("cache.save", this.#spanAttrs(), () => {});
  }

  async discard(): Promise<void> {
    return tracer.span("cache.discard", this.#spanAttrs(), () => {});
  }

  async clear(): Promise<void> {
    return tracer.span("cache.clear", this.#spanAttrs(), () => {});
  }

  #spanAttrs(): Tracer.SpansCacheAttrsBase {
    return {
      "app.id": this.app,
      "cache.layer": "null",
    };
  }
}
