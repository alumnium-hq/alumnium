import path from "node:path";
import { z } from "zod";
import type { AppId } from "../../AppId.js";
import type { RedisFileStoreBackend } from "../../FileStore/backends/RedisFileStoreBackend.js";
import type { S3FileStoreBackend } from "../../FileStore/backends/S3FileStoreBackend.js";
import { FileStore } from "../../FileStore/FileStore.js";
import { Model } from "../../Model.js";
import { SessionContext } from "../session/SessionContext.js";

export namespace CacheStore {
  export type Remote = z.infer<typeof CacheStore.Remote>;
}

export class CacheStore extends FileStore {
  static Remote = z.union([z.literal("redis"), z.literal("s3"), z.undefined()]);

  #sessionContext: SessionContext;
  #baseDir = process.env.ALUMNIUM_CACHE_PATH ?? FileStore.globalSubDir("cache");
  #subDir: string;
  #appOverride: AppId | undefined;

  constructor(sessionContext: SessionContext, subDir?: string) {
    super(FileStore.DYNAMIC_DIR_SYMBOL, {
      backend: CacheStore.#createBackendOption(),
    });
    this.#sessionContext = sessionContext;
    this.#subDir = subDir || "";
  }

  override get dir(): string {
    const { provider, name } = Model.current;
    return path.join(
      this.#baseDir,
      this.#appOverride ?? this.#sessionContext.app,
      provider,
      name,
      this.#subDir,
    );
  }

  override subStore(subDir: string, appOverride?: AppId): CacheStore {
    this.#appOverride = appOverride;
    return new CacheStore(
      this.#sessionContext,
      path.join(this.#subDir, subDir),
    );
  }

  static #createBackendOption(): FileStore.BackendOption | undefined {
    const remote = CacheStore.Remote.safeParse(
      process.env.ALUMNIUM_REMOTE_CACHE?.toLowerCase(),
    );

    switch (remote.data) {
      case "redis":
        return this.#createRedisBackendInit();
      case "s3":
        return this.#createS3BackendInit();
      case undefined:
        return undefined;
      default:
        throw new Error(
          `Unsupported ALUMNIUM_REMOTE_CACHE value: ${process.env.ALUMNIUM_REMOTE_CACHE}. Expected 'redis', 's3'.`,
        );
    }
  }

  static #createRedisBackendInit(): RedisFileStoreBackend.Init {
    const url = process.env.ALUMNIUM_REMOTE_CACHE_REDIS_URL;
    if (!url) {
      throw new Error(
        "ALUMNIUM_REMOTE_CACHE=redis requires ALUMNIUM_REMOTE_CACHE_REDIS_URL",
      );
    }

    return {
      kind: "redis",
      url,
    };
  }

  static #createS3BackendInit(): S3FileStoreBackend.Init {
    const region = process.env.ALUMNIUM_REMOTE_CACHE_S3_REGION;
    const bucket = process.env.ALUMNIUM_REMOTE_CACHE_S3_BUCKET;

    if (!region || !bucket) {
      throw new Error(
        "ALUMNIUM_REMOTE_CACHE=s3 requires ALUMNIUM_REMOTE_CACHE_S3_REGION and ALUMNIUM_REMOTE_CACHE_S3_BUCKET",
      );
    }

    const forcePathStyleRaw =
      process.env.ALUMNIUM_REMOTE_CACHE_S3_FORCE_PATH_STYLE;

    return {
      kind: "s3",
      region,
      bucket,
      accessKeyId: process.env.ALUMNIUM_REMOTE_CACHE_S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.ALUMNIUM_REMOTE_CACHE_S3_SECRET_ACCESS_KEY,
      sessionToken: process.env.ALUMNIUM_REMOTE_CACHE_S3_SESSION_TOKEN,
      endpoint: process.env.ALUMNIUM_REMOTE_CACHE_S3_ENDPOINT,
      forcePathStyle:
        forcePathStyleRaw === undefined
          ? undefined
          : forcePathStyleRaw.toLowerCase() === "true",
      prefix: process.env.ALUMNIUM_REMOTE_CACHE_S3_PREFIX,
    };
  }
}
