import { Env } from "../Env.ts";
import { Model } from "../Model.ts";
import { Logger } from "../telemetry/Logger.ts";
import { CachePruner } from "./cache/CachePruner.ts";
import { CacheStore } from "./cache/CacheStore.ts";
import { ChainedCache } from "./cache/ChainedCache.ts";
import { ElementsCache } from "./cache/ElementsCache/ElementsCache.ts";
import { NullCache } from "./cache/NullCache.ts";
import { ResponseCache } from "./cache/ResponseCache.ts";
import { ServerCache } from "./cache/ServerCache.ts";
import { SessionContext } from "./session/SessionContext.ts";

const logger = Logger.get(import.meta.url);

export class CacheFactory {
  static createCache(
    sessionContext: SessionContext,
    model: Model,
  ): ServerCache {
    const cacheProvider = Env.ALUMNIUM_CACHE;

    switch (cacheProvider) {
      case "sqlite":
        throw new Error(
          "ALUMNIUM_CACHE=sqlite is no longer supported. Use ALUMNIUM_CACHE=filesystem.",
        );

      case true:
      case "filesystem": {
        logger.info("Using filesystem cache");
        const cacheStore = new CacheStore(sessionContext, model);
        const pruner = new CachePruner(CacheStore.rootDir());
        return new ChainedCache(
          sessionContext,
          [
            new ResponseCache(sessionContext, cacheStore),
            new ElementsCache(sessionContext, cacheStore),
          ],
          () => pruner.autoPrune(),
        );
      }

      case false:
        logger.info("Using null cache");
        return new NullCache(sessionContext);
    }
  }
}
