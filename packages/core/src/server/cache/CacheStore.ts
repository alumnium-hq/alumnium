import path from "node:path";
import type { AppId } from "../../AppId.js";
import { FileStore } from "../../FileStore/FileStore.js";
import { GlobalFileStorePaths } from "../../FileStore/GlobalFileStorePaths.js";
import { Model } from "../../Model.js";
import { SessionContext } from "../session/SessionContext.js";

export class CacheStore extends FileStore {
  #sessionContext: SessionContext;
  #baseDir =
    process.env.ALUMNIUM_CACHE_PATH ??
    GlobalFileStorePaths.globalSubDir("cache");
  #subDir: string;
  #appOverride: AppId | undefined;

  constructor(sessionContext: SessionContext, subDir?: string) {
    super(FileStore.DYNAMIC_DIR_SYMBOL);
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
}
