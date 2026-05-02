import type { Generation } from "@langchain/core/outputs";
import { canonize } from "smolcanon";
import { xxh64Str } from "smolxxh/str";
import z from "zod";
import { AppId } from "../../AppId.ts";
import { Lchain } from "../../llm/Lchain.ts";
import type { LchainSchema } from "../../llm/LchainSchema.ts";
import { Telemetry } from "../../telemetry/Telemetry.ts";
import type { Tracer } from "../../telemetry/Tracer.ts";
import { stringExcerpt } from "../../utils/string.ts";
import type { Agent } from "../agents/Agent.ts";
import { LlmContext } from "../LlmContext.ts";
import { SessionContext } from "../session/SessionContext.ts";
import { CacheStore } from "./CacheStore.ts";
import { ServerCache } from "./ServerCache.ts";

const { logger, tracer } = Telemetry.get(import.meta.url);
const { span } = tracer.dec();

const CACHE_VERSION = "v1";

export namespace ResponseCache {
  export interface MemoryEntry {
    prompt: LlmContext.Prompt;
    llmKey: LlmContext.LlmKey;
    generations: LchainSchema.StoredGeneration[];
    app: AppId;
  }

  export type RequestHash = z.infer<typeof ResponseCache.RequestHash>;

  export interface InitiatedData {
    meta: Agent.Meta;
    requestHash: RequestHash;
  }
}

export class ResponseCache extends ServerCache {
  static RequestHash = z.string().brand("ResponseCache.RequestHash");

  readonly #cacheStore: CacheStore;
  readonly #llmContext: LlmContext;
  #memoryCache: Record<ResponseCache.RequestHash, ResponseCache.MemoryEntry> =
    {};

  constructor(
    sessionContext: SessionContext,
    cacheStore: CacheStore,
    llmContext: LlmContext,
  ) {
    super(sessionContext);
    this.#cacheStore = cacheStore.subStore("responses");
    this.#llmContext = llmContext;
  }
  override async lookup(
    prompt: LlmContext.Prompt,
    llmKey: LlmContext.LlmKey,
  ): Promise<Generation[] | null> {
    return tracer.span("cache.lookup", this.#spanAttrs(), async (span) => {
      const agentMeta = this.#llmContext.getPromptMeta(prompt);
      if (!agentMeta) {
        logger.warn(
          `No metadata found, skipping request cache lookup for prompt: "${stringExcerpt(prompt, 100)}"...`,
        );
        span.event("cache.lookup.miss", {
          ...this.#spanAttrs(),
          "cache.lookup.miss.reason": "no_meta",
        });

        return null;
      }

      const { requestHash } = this.#initiate(agentMeta, prompt, llmKey);

      try {
        const memoryEntry = this.#memoryCache[requestHash];
        if (memoryEntry) {
          logger.debug(
            `Cache hit (in-memory) for prompt: "${stringExcerpt(prompt, 100)}..."`,
          );
          span.event("cache.lookup.hit", {
            ...this.#spanAttrs(),
            "agent.kind": agentMeta.kind,
            "cache.hash": requestHash,
            "cache.lookup.hit.source": "memory",
          });

          this.applyUsage(memoryEntry.generations);
          return memoryEntry.generations.map(Lchain.fromStored);
        }

        const entryStore = this.#cacheStore.subStore(requestHash);

        const storedGenerations =
          await entryStore.readJson<LchainSchema.StoredGeneration[]>(
            "response.json",
          );
        if (!storedGenerations) {
          span.event("cache.lookup.miss", {
            ...this.#spanAttrs(),
            "agent.kind": agentMeta.kind,
            "cache.hash": requestHash,
            "cache.lookup.miss.reason": "not_found",
          });

          return null;
        }

        logger.debug(
          `Cache hit (file) for prompt: "${stringExcerpt(prompt, 100)}...":`,
        );
        span.event("cache.lookup.hit", {
          ...this.#spanAttrs(),
          "agent.kind": agentMeta.kind,
          "cache.hash": requestHash,
          "cache.lookup.hit.source": "store",
        });

        this.applyUsage(storedGenerations);

        return storedGenerations.map(Lchain.fromStored);
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
    prompt: LlmContext.Prompt,
    llmKey: LlmContext.LlmKey,
    generations: Generation[],
  ): Promise<void> {
    return tracer.span("cache.update", this.#spanAttrs(), async (span) => {
      const agentMeta = this.#llmContext.getPromptMeta(prompt);
      if (!agentMeta) {
        logger.warn(
          `No metadata found, skipping response cache update for prompt: "${stringExcerpt(prompt, 100)}"...`,
        );
        span.event("cache.update.skip", {
          ...this.#spanAttrs(),
          "cache.update.skip.reason": "no_meta",
        });
        return;
      }

      const { requestHash } = this.#initiate(agentMeta, prompt, llmKey);

      const storedGenerations = generations.map(Lchain.toStored);
      this.#memoryCache[requestHash] = {
        prompt,
        llmKey,
        generations: storedGenerations,
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
        const { prompt, llmKey, generations, app } = entry;
        const entryStore = this.#cacheStore.subStore(hash, app);

        await Promise.all([
          entryStore.writeJson("response.json", generations),
          entryStore.writeJson("request.json", { prompt, llmKey, app }),
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

  #initiate(
    agentMeta: Agent.Meta,
    prompt: LlmContext.Prompt,
    llmKey: LlmContext.LlmKey,
  ): ResponseCache.InitiatedData {
    const requestHash = this.#hashRequest(prompt, llmKey, agentMeta);
    return {
      meta: agentMeta,
      requestHash,
    };
  }

  #hashRequest(
    prompt: LlmContext.Prompt,
    llmKey: LlmContext.LlmKey,
    agentMeta: Agent.Meta,
  ): ResponseCache.RequestHash {
    const metaCanon = canonize(agentMeta);
    const str = [CACHE_VERSION, this.app, prompt, llmKey, metaCanon].join("|");
    return xxh64Str(str);
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
