import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { AppId } from "../../AppId.ts";
import { AiSdk } from "../../llm/AiSdk.ts";
import { Telemetry } from "../../telemetry/Telemetry.ts";
import type { Tracer } from "../../telemetry/Tracer.ts";
import { SessionContext } from "../session/SessionContext.ts";
import { CacheStore } from "./CacheStore.ts";
import { ServerCache } from "./ServerCache.ts";

const { logger, tracer } = Telemetry.get(import.meta.url);
const { span } = tracer.dec();

export namespace ResponseCache {
  export interface MemoryEntry {
    request: ServerCache.CacheRequest;
    result: LanguageModelV4GenerateResult;
    app: AppId;
  }
}

export class ResponseCache extends ServerCache {
  readonly #cacheStore: CacheStore;
  #memoryCache: Record<ServerCache.CacheKey, ResponseCache.MemoryEntry> = {};

  constructor(sessionContext: SessionContext, cacheStore: CacheStore) {
    super(sessionContext);
    this.#cacheStore = cacheStore.subStore("responses");
  }
  override async lookup(
    request: ServerCache.CacheRequest,
  ): Promise<LanguageModelV4GenerateResult | null> {
    return tracer.span("cache.lookup", this.#spanAttrs(), async (span) => {
      const requestHash = request.key;
      const agentMeta = request.meta;

      try {
        const memoryEntry = this.#memoryCache[requestHash];
        if (memoryEntry) {
          logger.debug(`Response cache hit (in-memory): ${requestHash}`);
          span.event("cache.lookup.hit", {
            ...this.#spanAttrs(),
            "agent.kind": agentMeta.kind,
            "cache.hash": requestHash,
            "cache.lookup.hit.source": "memory",
          });

          this.applyUsage(memoryEntry.result);
          return structuredClone(memoryEntry.result);
        }

        const entryStore = this.#cacheStore.subStore(requestHash);

        const storedResult = await entryStore.readJson("response.json");
        if (!storedResult) {
          span.event("cache.lookup.miss", {
            ...this.#spanAttrs(),
            "agent.kind": agentMeta.kind,
            "cache.hash": requestHash,
            "cache.lookup.miss.reason": "not_found",
          });

          return null;
        }

        logger.debug(`Response cache hit (file): ${requestHash}`);
        span.event("cache.lookup.hit", {
          ...this.#spanAttrs(),
          "agent.kind": agentMeta.kind,
          "cache.hash": requestHash,
          "cache.lookup.hit.source": "store",
        });

        const result = AiSdk.fromStored(storedResult);
        this.applyUsage(result);
        return result;
      } catch (error) {
        logger.warn(`Error occurred while looking up cache: {error}`, {
          error,
        });
        span.event("cache.lookup.miss", {
          ...this.#spanAttrs(),
          "agent.kind": agentMeta.kind,
          "cache.hash": requestHash,
          "cache.lookup.miss.reason": "error",
        });

        return null;
      }
    });
  }

  override async update(
    request: ServerCache.CacheRequest,
    result: LanguageModelV4GenerateResult,
  ): Promise<void> {
    return tracer.span("cache.update", this.#spanAttrs(), async () => {
      const requestHash = request.key;
      this.#memoryCache[requestHash] = {
        request: structuredClone(request),
        result: AiSdk.toStored(result),
        app: this.app,
      };
    });
  }

  @span("cache.save", spanAttrs)
  async save(): Promise<void> {
    const entries = Object.entries(this.#memoryCache);
    if (!entries.length) return;

    logger.debug(`Saving ${entries.length} response cache entries...`);

    await Promise.all(
      entries.map(async ([hash, entry]) => {
        const { request, result, app } = entry;
        const entryStore = this.#cacheStore.subStore(hash, app);

        await Promise.all([
          entryStore.writeJson("response.json", result),
          entryStore.writeJson("request.json", {
            version: "ai-sdk-v1",
            key: request.key,
            app,
            model: request.model,
            params: request.params,
            meta: request.meta,
          }),
        ]);
      }),
    );

    await this.discard();
  }

  @span("cache.discard", spanAttrs)
  async discard(): Promise<void> {
    this.#memoryCache = {};
  }

  @span("cache.clear", spanAttrs)
  async clear(): Promise<void> {
    await this.#cacheStore.clear();
    await this.discard();
  }

  #spanAttrs(): Tracer.SpansCacheAttrsBase {
    return spanAttrs.call(this);
  }
}

function spanAttrs(this: ResponseCache): Tracer.SpansCacheAttrsBase {
  return {
    "app.id": this.app,
    "cache.layer": "response",
  };
}
