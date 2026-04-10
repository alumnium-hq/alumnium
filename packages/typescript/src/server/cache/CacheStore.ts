import path from "node:path";
import type { AppId } from "../../AppId.ts";
import { FileStore } from "../../FileStore/FileStore.ts";
import { GlobalFileStorePaths } from "../../FileStore/GlobalFileStorePaths.ts";
import { Model } from "../../Model.ts";
import { SessionContext } from "../session/SessionContext.ts";

export class CacheStore extends FileStore {
  #sessionContext: SessionContext;
  #model: Model;
  #baseDir =
    process.env.ALUMNIUM_CACHE_PATH ??
    GlobalFileStorePaths.globalSubDir("cache");
  #subDir: string;
  #appOverride: AppId | undefined;

  constructor(sessionContext: SessionContext, model: Model, subDir?: string) {
    super(FileStore.DYNAMIC_DIR_SYMBOL);
    this.#sessionContext = sessionContext;
    this.#model = model;
    this.#subDir = subDir || "";
  }

  override get dir(): string {
    const { provider, name } = this.#model;
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
      this.#model,
      path.join(this.#subDir, subDir),
    );
  }
}
