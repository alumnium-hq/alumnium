import fs from "node:fs/promises";
import z from "zod";
import { Env } from "../../Env.ts";
import { FileStore } from "../../FileStore/FileStore.ts";
import { GlobalFileStorePaths } from "../../FileStore/GlobalFileStorePaths.ts";
import { Logger } from "../../telemetry/Logger.ts";
import { safePathJoin } from "../../utils/fs.ts";
import { sleep } from "../../utils/timers.ts";
import { KnowledgeLayer } from "./KnowledgeLayer.ts";
import { KnowledgeManifest } from "./KnowledgeManifest.ts";

const logger = Logger.get(import.meta.url);

export namespace KnowledgeStore {
  /** Kind of lesson, named after the `Alumni` method it teaches. */
  export type Kind = "do" | HintKind;

  /** Kinds of lessons that hint how to handle an instruction. */
  export type HintKind = "get" | "check" | "find" | "area";

  /** What a lesson teaches for an instruction, by kind. */
  export interface Values {
    do: string[];
    get: string;
    check: string;
    find: string;
    area: string;
  }

  export type Entry<K extends Kind> = [instruction: string, value: Values[K]];

  /** Lessons of one layer, by kind and instruction. */
  export type Lessons = {
    [K in Kind]: Map<string, Values[K]>;
  };

  export type File = z.infer<typeof KnowledgeStore.File>;

  /** A layer file found in the store. */
  export interface LayerRef {
    /** Product scope, `null` for the shared layer. */
    scope: string | null;
    layer: KnowledgeLayer.Layer;
  }
}

/**
 * Persists lessons taught with `Alumni.knowledge`, so they apply to later
 * sessions. Lessons are model-agnostic and kept in one readable file per
 * layer, keyed by kind and instruction:
 *
 * ```
 * knowledge.json              manifest (optional)
 * shared.json                 shared layer
 * <scope>/lessons.json        product layer
 * <scope>/<platform>.json     platform layer: web.json, ios.json, android.json
 * ```
 */
export class KnowledgeStore extends FileStore {
  static MANIFEST_FILE = "knowledge.json";

  static SHARED_FILE = "shared.json";

  static PRODUCT_FILE = "lessons.json";

  static KINDS: readonly KnowledgeStore.Kind[] = [
    "do",
    "get",
    "check",
    "find",
    "area",
  ];

  static HINT_KINDS: readonly KnowledgeStore.HintKind[] = [
    "get",
    "check",
    "find",
    "area",
  ];

  static File = z
    .object({
      do: z.record(z.string(), z.array(z.string())),
      get: z.record(z.string(), z.string()),
      check: z.record(z.string(), z.string()),
      find: z.record(z.string(), z.string()),
      area: z.record(z.string(), z.string()),
    })
    .partial()
    .strict();

  static #LOCK_TIMEOUT_MS = 10_000;

  static #LOCK_STALE_MS = 30_000;

  /** Writes per file in this process, chained so they don't interleave. */
  static #writes = new Map<string, Promise<unknown>>();

  constructor() {
    super(
      Env.ALUMNIUM_KNOWLEDGE_PATH ??
        GlobalFileStorePaths.globalSubDir("knowledge"),
    );
  }

  static empty(): KnowledgeStore.Lessons {
    return {
      do: new Map(),
      get: new Map(),
      check: new Map(),
      find: new Map(),
      area: new Map(),
    };
  }

  /** Reads the manifest, empty when there's none. */
  async manifest(): Promise<KnowledgeManifest> {
    const source = this.resolve(KnowledgeStore.MANIFEST_FILE);
    let json: unknown;
    try {
      json = await this.readJson(KnowledgeStore.MANIFEST_FILE);
    } catch (error) {
      throw new Error(`Invalid knowledge manifest ${source}: ${error}`);
    }
    return json === null
      ? KnowledgeManifest.EMPTY
      : KnowledgeManifest.parse(json, source);
  }

  /**
   * Reads lessons of a layer. A malformed layer file is an error naming it.
   *
   * @param scope Product scope, ignored for the shared layer.
   */
  async layer(
    scope: string | null,
    layer: KnowledgeLayer.Layer,
  ): Promise<KnowledgeStore.Lessons> {
    const lessons = KnowledgeStore.empty();
    const set = (
      kind: KnowledgeStore.Kind,
      instruction: string,
      value: unknown,
    ) => (lessons[kind] as Map<string, unknown>).set(instruction, value);

    const file = await this.#readFile(KnowledgeStore.#layerPath(scope, layer));
    for (const kind of KnowledgeStore.KINDS) {
      for (const [instruction, value] of Object.entries(file[kind] ?? {})) {
        set(kind, instruction, value);
      }
    }

    return lessons;
  }

  /**
   * Saves a lesson in a layer, replacing the one for the same instruction.
   *
   * @param scope Product scope, ignored for the shared layer.
   */
  async save<K extends KnowledgeStore.Kind>(
    scope: string | null,
    layer: KnowledgeLayer.Layer,
    kind: K,
    instruction: string,
    value: KnowledgeStore.Values[K],
  ): Promise<void> {
    await this.#update(KnowledgeStore.#layerPath(scope, layer), (file) => {
      file[kind] = { ...file[kind], [instruction]: value } as never;
    });
  }

  /**
   * Removes a lesson from a layer.
   *
   * @returns Whether a lesson was removed.
   */
  async forget(
    scope: string | null,
    layer: KnowledgeLayer.Layer,
    kind: KnowledgeStore.Kind,
    instruction: string,
  ): Promise<boolean> {
    let removed = false;
    await this.#update(KnowledgeStore.#layerPath(scope, layer), (file) => {
      const lessons = file[kind];
      if (lessons && instruction in lessons) {
        delete lessons[instruction];
        removed = true;
      }
    });

    return removed;
  }

  /** Removes all lessons of a layer. */
  async clearLayer(
    scope: string | null,
    layer: KnowledgeLayer.Layer,
  ): Promise<void> {
    const relPath = KnowledgeStore.#layerPath(scope, layer);
    await this.#withLock(relPath, () => this.remove(relPath));
  }

  /** Lists layers that have lessons, the shared layer first. */
  async layers(): Promise<KnowledgeStore.LayerRef[]> {
    const refs: KnowledgeStore.LayerRef[] = [];
    if ((await this.mtime(KnowledgeStore.SHARED_FILE)) !== null) {
      refs.push({ scope: null, layer: "shared" });
    }

    const entries = await fs
      .readdir(this.dir, { withFileTypes: true })
      .catch(() => []);
    const scopes = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .toSorted();

    for (const scope of scopes) {
      const files = new Set(await this.list(scope));
      for (const layer of KnowledgeLayer.PRECEDENCE) {
        if (layer === "shared") continue;
        if (files.has(KnowledgeStore.#layerFileName(layer))) {
          refs.push({ scope, layer });
        }
      }
    }

    return refs;
  }

  /**
   * Validates the manifest and every layer file.
   *
   * @returns Problems found, empty when the store is valid.
   */
  async validate(): Promise<string[]> {
    const problems: string[] = [];
    const check = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error));
      }
    };

    await check(() => this.manifest());
    for (const { scope, layer } of await this.layers()) {
      await check(() => this.layer(scope, layer));
    }
    return problems;
  }

  async #readFile(relPath: string): Promise<KnowledgeStore.File> {
    const source = this.resolve(relPath);
    let json: unknown;
    try {
      json = await this.readJson(relPath);
    } catch (error) {
      throw new Error(`Invalid knowledge file ${source}: ${error}`);
    }
    if (json === null) return {};

    const result = KnowledgeStore.File.safeParse(json);
    if (!result.success) {
      throw new Error(
        `Invalid knowledge file ${source}: ${z.prettifyError(result.error)}`,
      );
    }
    return result.data;
  }

  /** Reads, changes and writes a layer file under its lock. */
  async #update(
    relPath: string,
    change: (file: KnowledgeStore.File) => void | Promise<void>,
  ): Promise<void> {
    await this.#withLock(relPath, async () => {
      const file = await this.#readFile(relPath);
      await change(file);

      // Sorted, so the file doesn't depend on the order lessons were learned
      // in and changes show up as small diffs.
      const sorted: Record<string, Record<string, unknown>> = {};
      for (const kind of KnowledgeStore.KINDS) {
        const lessons = file[kind];
        if (!lessons || !Object.keys(lessons).length) continue;
        sorted[kind] = Object.fromEntries(
          Object.entries(lessons).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        );
      }

      if (Object.keys(sorted).length) {
        await this.writeJson(relPath, sorted);
      } else {
        await this.remove(relPath);
      }
    });
  }

  /**
   * Runs the function holding the file's lock, so writes from this and other
   * processes don't interleave. A lock older than 30 seconds is stale and
   * taken over.
   */
  async #withLock<Result>(
    relPath: string,
    fn: () => Promise<Result>,
  ): Promise<Result> {
    const filePath = this.resolve(relPath);
    const previous = KnowledgeStore.#writes.get(filePath) ?? Promise.resolve();
    const run = previous
      .catch(() => {})
      .then(async () => {
        const lockPath = await this.ensureFilePath(`${relPath}.lock`);
        await KnowledgeStore.#acquire(lockPath);
        try {
          return await fn();
        } finally {
          await fs.rm(lockPath, { force: true });
        }
      });

    KnowledgeStore.#writes.set(filePath, run);
    try {
      return await run;
    } finally {
      if (KnowledgeStore.#writes.get(filePath) === run) {
        KnowledgeStore.#writes.delete(filePath);
      }
    }
  }

  static async #acquire(lockPath: string): Promise<void> {
    const deadline = Date.now() + KnowledgeStore.#LOCK_TIMEOUT_MS;
    for (;;) {
      try {
        const handle = await fs.open(lockPath, "wx");
        await handle.close();
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }

      const stat = await fs.stat(lockPath).catch(() => null);
      if (stat && Date.now() - stat.mtimeMs > KnowledgeStore.#LOCK_STALE_MS) {
        logger.warn(`Taking over stale knowledge lock ${lockPath}`);
        await fs.rm(lockPath, { force: true });
        continue;
      }

      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for knowledge lock ${lockPath}`);
      }
      await sleep(50);
    }
  }

  static #layerFileName(layer: KnowledgeLayer.Layer): string {
    return layer === "product" ? KnowledgeStore.PRODUCT_FILE : `${layer}.json`;
  }

  static #layerPath(scope: string | null, layer: KnowledgeLayer.Layer): string {
    if (layer === "shared") return KnowledgeStore.SHARED_FILE;
    if (!scope) throw new Error(`The ${layer} layer needs a knowledge scope`);
    return safePathJoin(scope, KnowledgeStore.#layerFileName(layer));
  }
}
