import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Env } from "../../Env.ts";
import { Logger } from "../../telemetry/Logger.ts";

const logger = Logger.get(import.meta.url);

export namespace CachePruner {
  export interface Options {
    maxAge?: number | undefined; // ms
    maxSize?: number | undefined; // bytes
    dryRun?: boolean | undefined;
  }

  export interface Entry {
    dir: string;
    size: number;
    lastUsed: number;
  }

  export interface Result {
    entries: number;
    size: number;
    removedEntries: number;
    removedSize: number;
  }
}

export class CachePruner {
  static TARGET_SIZE_RATIO = 0.9;
  static GRACE_PERIOD_MS = 60 * 60 * 1000;
  static AUTO_PRUNE_INTERVAL_MS = 60 * 60 * 1000;
  static STALE_LOCK_MS = 10 * 60 * 1000;

  static #ENTRY_FILE = "response.json";
  static #LOCK_FILE = ".prune.lock";
  static #STAMP_FILE = ".prune.stamp";
  static #TRASH_PREFIX = ".trash-";

  readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  async entries(): Promise<CachePruner.Entry[]> {
    const entries: CachePruner.Entry[] = [];
    await this.#scanEntries(this.dir, entries);
    return entries;
  }

  async prune(
    options: CachePruner.Options,
  ): Promise<CachePruner.Result | null> {
    const exists = await fs.stat(this.dir).catch(() => null);
    if (!exists)
      return { entries: 0, size: 0, removedEntries: 0, removedSize: 0 };

    const lockPath = path.join(this.dir, CachePruner.#LOCK_FILE);
    if (!(await this.#acquireLock(lockPath))) {
      logger.debug(`Cache ${this.dir} is already being pruned, skipping`);
      return null;
    }

    try {
      return await this.#prune(options);
    } finally {
      await fs.rm(lockPath, { force: true });
    }
  }

  async pruneEvery(
    interval: number,
    options: CachePruner.Options,
  ): Promise<CachePruner.Result | null> {
    const stampPath = path.join(this.dir, CachePruner.#STAMP_FILE);
    const stamp = await fs.stat(stampPath).catch(() => null);
    if (stamp && Date.now() - stamp.mtimeMs < interval) return null;

    const exists = await fs.stat(this.dir).catch(() => null);
    if (!exists) return null;

    await fs.writeFile(stampPath, "");
    return this.prune(options);
  }

  async autoPrune(): Promise<void> {
    const maxSize = Env.ALUMNIUM_CACHE_MAX_SIZE || undefined;
    const maxAge = Env.ALUMNIUM_CACHE_MAX_AGE;
    if (!maxSize && !maxAge) return;

    try {
      const result = await this.pruneEvery(CachePruner.AUTO_PRUNE_INTERVAL_MS, {
        maxSize,
        maxAge,
      });

      if (result?.removedEntries)
        logger.info(
          `Pruned {removedEntries} of {entries} cache entries ({removedSize} of {size} bytes)`,
          { ...result },
        );
    } catch (error) {
      logger.warn(`Failed to prune cache: {error}`, { error });
    }
  }

  async #prune({
    maxSize = Infinity,
    maxAge = Infinity,
    dryRun = false,
  }: CachePruner.Options): Promise<CachePruner.Result> {
    if (!dryRun) await this.#removeTrash();

    const now = Date.now();
    const entries = await this.entries();
    entries.sort((a, b) => a.lastUsed - b.lastUsed);

    const size = entries.reduce((sum, entry) => sum + entry.size, 0);
    const targetSize =
      size > maxSize ? maxSize * CachePruner.TARGET_SIZE_RATIO : Infinity;
    let remainingSize = size;
    let removedEntries = 0;

    for (const entry of entries) {
      const age = now - entry.lastUsed;
      if (age < CachePruner.GRACE_PERIOD_MS) break;
      if (remainingSize <= targetSize && age <= maxAge) break;

      if (dryRun || (await this.#remove(entry))) {
        remainingSize -= entry.size;
        removedEntries++;
      }
    }

    return {
      entries: entries.length,
      size,
      removedEntries,
      removedSize: size - remainingSize,
    };
  }

  async #remove(entry: CachePruner.Entry): Promise<boolean> {
    const trashDir = path.join(
      this.dir,
      `${CachePruner.#TRASH_PREFIX}${randomUUID()}`,
    );
    try {
      // Rename to disappear at once for subsequent lookups.
      // rm -rf might crash midway removal.
      await fs.rename(entry.dir, trashDir);
    } catch {
      return false;
    }
    await fs.rm(trashDir, { recursive: true, force: true });
    return true;
  }

  async #removeTrash(): Promise<void> {
    const names = await fs.readdir(this.dir);
    await Promise.all(
      names
        .filter((name) => name.startsWith(CachePruner.#TRASH_PREFIX))
        .map((name) =>
          fs.rm(path.join(this.dir, name), { recursive: true, force: true }),
        ),
    );
  }

  async #scanEntries(dir: string, entries: CachePruner.Entry[]): Promise<void> {
    const dirents = await fs
      .readdir(dir, { withFileTypes: true })
      .catch(() => []);
    const files = dirents.filter((dirent) => dirent.isFile());

    if (files.some((file) => file.name === CachePruner.#ENTRY_FILE)) {
      const stats = await Promise.all(
        files.map((file) =>
          fs.stat(path.join(dir, file.name)).catch(() => null),
        ),
      );

      const entryStat =
        stats[files.findIndex((f) => f.name === CachePruner.#ENTRY_FILE)];
      if (!entryStat) return; // Another process removed the entry.

      entries.push({
        dir,
        size: stats.reduce((sum, stat) => sum + (stat?.size ?? 0), 0),
        lastUsed: entryStat.mtimeMs,
      });
      return;
    }

    await Promise.all(
      dirents
        .filter(
          (dirent) => dirent.isDirectory() && !dirent.name.startsWith("."),
        )
        .map((dirent) =>
          this.#scanEntries(path.join(dir, dirent.name), entries),
        ),
    );
  }

  async #acquireLock(lockPath: string): Promise<boolean> {
    try {
      await fs.writeFile(lockPath, String(process.pid), { flag: "wx" });
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }

    const stat = await fs.stat(lockPath).catch(() => null);
    if (stat && Date.now() - stat.mtimeMs < CachePruner.STALE_LOCK_MS)
      return false;

    await fs.rm(lockPath, { force: true });
    return fs
      .writeFile(lockPath, String(process.pid), { flag: "wx" })
      .then(() => true)
      .catch(() => false);
  }
}
