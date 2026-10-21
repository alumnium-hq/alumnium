import {
  Env,
  FileStore,
  GlobalFileStorePaths,
  safePathJoin,
  Telemetry,
} from "@alumnium/core/internal";
import { Recording } from "./Recording.ts";
import type { TestCache } from "./TestCache.ts";

const { logger } = Telemetry.get(import.meta.url);

export namespace FileTestCache {
  export interface Props {
    /** Directory to store recordings in, `<ALUMNIUM_CACHE_PATH>/tests` by default. */
    dir?: string | undefined;
  }
}

/**
 * Test cache storing each recording as `<xxh64(text)>.json`, in the `tests`
 * directory of the Alumnium cache.
 */
export class FileTestCache implements TestCache {
  #store: FileStore;
  #staged = new Map<Recording.Id, Recording.Type>();
  #lookups: TestCache.Lookups = { hits: 0, misses: 0 };

  constructor(props: FileTestCache.Props = {}) {
    this.#store = new FileStore(props.dir ?? FileTestCache.defaultDir());
  }

  static defaultDir(): string {
    return safePathJoin(
      Env.ALUMNIUM_CACHE_PATH ?? GlobalFileStorePaths.globalSubDir("cache"),
      "tests",
    );
  }

  get dir(): string {
    return this.#store.dir;
  }

  get lookups(): TestCache.Lookups {
    return { ...this.#lookups };
  }

  async lookup(
    text: string,
    options: TestCache.LookupOptions = {},
  ): Promise<Recording.Type | null> {
    const { version = Recording.DEFAULT_VERSION } = options;
    const id = Recording.textToId(text);
    const found = this.#staged.get(id) ?? (await this.#read(id));
    if (found?.version === version) {
      logger.debug(`Test cache hit: ${id}`);
      this.#lookups.hits++;
      return structuredClone(found);
    }

    logger.debug(
      found
        ? `Test cache miss: ${id} is recorded in version ${found.version}, not ${version}`
        : `Test cache miss: ${id}`,
    );
    this.#lookups.misses++;
    return null;
  }

  async update(recording: Recording.Type): Promise<void> {
    this.#staged.set(recording.id, structuredClone(recording));
  }

  async save(): Promise<void> {
    const staged = [...this.#staged];
    if (!staged.length) return;

    logger.debug(`Saving ${staged.length} test recordings...`);

    await Promise.all(
      staged.map(([id, recording]) =>
        this.#store.writeJson(fileName(id), recording),
      ),
    );

    // Updates staged while writing stay staged.
    for (const [id, recording] of staged)
      if (this.#staged.get(id) === recording) this.#staged.delete(id);
  }

  async discard(): Promise<void> {
    this.#staged.clear();
  }

  /**
   * Reads a saved recording.
   *
   * NOTE: A file that fails to parse is treated as a miss rather than an error,
   * so that a recording made by an incompatible version is recorded again and
   * replaced instead of failing the test.
   */
  async #read(id: Recording.Id): Promise<Recording.Type | null> {
    try {
      return await this.#store.readJson(fileName(id), Recording.Schema);
    } catch (error) {
      logger.warn(`Failed to read test recording ${id}: {error}`, { error });
      return null;
    }
  }
}

function fileName(id: Recording.Id): string {
  return `${id}.json`;
}
