import { Model } from "../Model.ts";
import { Logger } from "../telemetry/Logger.ts";
import { CacheStore } from "./cache/CacheStore.ts";
import { ChainedCache } from "./cache/ChainedCache.ts";
import { ElementsCache } from "./cache/ElementsCache/ElementsCache.ts";
import { NullCache } from "./cache/NullCache.ts";
import { ResponseCache } from "./cache/ResponseCache.ts";
import { ServerCache } from "./cache/ServerCache.ts";
import { LlmContext } from "./LlmContext.ts";
import { SessionContext } from "./session/SessionContext.ts";

const logger = Logger.get(import.meta.url);

export class CacheFactory {
  static createCache(
    sessionContext: SessionContext,
    llmContext: LlmContext,
    model: Model,
  ): ServerCache {
    const cacheProvider = (
      process.env.ALUMNIUM_CACHE ?? "filesystem"
    ).toLowerCase();

    switch (cacheProvider) {
      case "sqlite":
        throw new Error(
          "ALUMNIUM_CACHE=sqlite is no longer supported. Use ALUMNIUM_CACHE=filesystem.",
        );

      case "filesystem": {
        logger.info("Using filesystem cache");
        const cacheStore = new CacheStore(sessionContext, model);
        return new ChainedCache(sessionContext, [
          new ResponseCache(sessionContext, cacheStore, llmContext),
          new ElementsCache(sessionContext, cacheStore, llmContext),
        ]);
      }

      case "false":
      case "0":
      case "none":
      case "null":
        logger.info("Using null cache");
        return new NullCache(sessionContext);

      default:
        logger.error(`Unknown cache provider: ${cacheProvider}`);
        throw new Error(`Unknown cache provider: ${cacheProvider}`);
    }
  }
}
