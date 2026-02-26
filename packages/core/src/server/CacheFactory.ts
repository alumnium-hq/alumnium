import { getLogger } from "../utils/logger.js";
import { NullCache } from "./cache/NullCache.js";

const logger = getLogger(import.meta.url);

export class CacheFactory {
  static createCache(): NullCache {
    const cacheProvider = (
      process.env.ALUMNIUM_CACHE ?? "filesystem"
    ).toLowerCase();

    switch (cacheProvider) {
      case "sqlite":
        logger.warn(
          "SQLite cache is not implemented in the TypeScript version",
        );
        return new NullCache();

      case "filesystem":
        logger.warn(
          "Filesystem cache is not implemented in the TypeScript version",
        );
        return new NullCache();

      case "false":
      case "0":
      case "none":
      case "null":
        return new NullCache();

      default:
        throw new Error(`Unknown cache provider: ${cacheProvider}`);
    }
  }
}
