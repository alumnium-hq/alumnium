import fs from "node:fs/promises";
import { z } from "zod";
import { Driver } from "../../drivers/Driver.ts";
import { FileStore } from "../../FileStore/FileStore.ts";
import type { TreeDevDrill } from "./TreeDevDrill.ts";

export namespace TreeDevDrillStore {
  export type ResultFile = z.infer<typeof TreeDevDrillStore.ResultFile>;

  export type LockOwner = z.infer<typeof TreeDevDrillStore.LockOwner>;
}

export class TreeDevDrillStore {
  static Ids = z.object({
    parsed: z.string(),
    simplified: z.number().optional(),
    raw: z.number().optional(),
    external: z.union([z.number(), z.string()]).optional(),
  });

  static Failure = z.object({
    action: z.string(),
    stage: z.enum(["parse", "map", "resolve", "probe"]),
    role: z.string().optional(),
    ids: TreeDevDrillStore.Ids,
    error: z.string(),
  });

  static TreeResult = z.object({
    platform: Driver.Platform,
    input: z.string(),
    output: z.string(),
    failures: z.array(TreeDevDrillStore.Failure),
  });

  static ResultFile = z.record(z.string(), TreeDevDrillStore.TreeResult);

  static LockOwner = z.object({
    pid: z.number(),
    token: z.string(),
  });

  static default = new TreeDevDrillStore(
    FileStore.subStore(undefined, "dev", "drill"),
  );

  static #LOCK_RETRY_MS = 25;
  static #LOCK_TIMEOUT_MS = 10_000;
  static #LOCK_STALE_MS = 30_000;

  static #updateQueues: Record<string, Promise<void>> = {};

  readonly store: FileStore;

  constructor(store: FileStore) {
    this.store = store;
  }

  get resultPath(): string {
    return this.store.resolve("result.json");
  }

  async update(key: string, entry: TreeDevDrill.TreeResult): Promise<void> {
    const resultRelPath = "result.json";
    await this.store.ensureFilePath(resultRelPath);
    await TreeDevDrillStore.#enqueueUpdate(this.store.dir, async () => {
      await TreeDevDrillStore.#withFileLock(this.store, async () => {
        const result = await TreeDevDrillStore.#readResultFile(
          this.store,
          resultRelPath,
        );
        result[key] = TreeDevDrillStore.#mergeTreeResult(result[key], entry);
        await TreeDevDrillStore.#atomicWriteJson(
          this.store,
          resultRelPath,
          result,
        );
      });
    });
  }

  static #enqueueUpdate(queueKey: string, task: () => Promise<void>) {
    const previous = this.#updateQueues[queueKey] ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(task);
    this.#updateQueues[queueKey] = current;
    return current.finally(() => {
      if (this.#updateQueues[queueKey] === current) {
        delete this.#updateQueues[queueKey];
      }
    });
  }

  static async #readResultFile(
    store: FileStore,
    relPath: string,
  ): Promise<TreeDevDrillStore.ResultFile> {
    try {
      const parsed = await store.readJson(
        relPath,
        TreeDevDrillStore.ResultFile,
      );
      return parsed ?? {};
    } catch {
      // Preserve malformed diagnostics before starting a new aggregate.
      const corruptRelPath = `${relPath}.corrupt-${Date.now()}-${process.pid}`;
      await store.rename(relPath, corruptRelPath).catch(() => undefined);
      return {};
    }
  }

  static #mergeTreeResult(
    previous: TreeDevDrill.TreeResult | undefined,
    current: TreeDevDrill.TreeResult,
  ): TreeDevDrill.TreeResult {
    const failures = previous?.failures ? [...previous.failures] : [];
    for (const failure of current.failures) {
      const key = this.#failureKey(failure);
      const index = failures.findIndex(
        (item) => this.#failureKey(item) === key,
      );
      if (index === -1) failures.push(failure);
      else failures[index] = failure;
    }
    return { ...current, failures };
  }

  static #failureKey(failure: TreeDevDrill.Failure): string {
    return JSON.stringify([
      failure.stage,
      failure.ids.parsed,
      failure.ids.simplified,
      failure.ids.raw,
      failure.ids.external,
      failure.error,
    ]);
  }

  static async #atomicWriteJson(
    store: FileStore,
    relPath: string,
    result: TreeDevDrillStore.ResultFile,
  ): Promise<void> {
    const temporaryRelPath = `${relPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      await store.writeJson(temporaryRelPath, result);
      await store.rename(temporaryRelPath, relPath);
    } finally {
      await store.remove(temporaryRelPath).catch(() => undefined);
    }
  }

  static async #withFileLock(
    store: FileStore,
    task: () => Promise<void>,
  ): Promise<void> {
    const lockRelPath = "result.json.lock";
    const lockPath = store.resolve(lockRelPath);
    const deadline = Date.now() + this.#LOCK_TIMEOUT_MS;

    while (Date.now() < deadline) {
      try {
        const handle = await fs.open(lockPath, "wx");
        const owner = this.#createLockOwner();
        try {
          await handle.writeFile(JSON.stringify(owner));
          await task();
        } finally {
          await handle.close().catch(() => undefined);
          await this.#removeOwnedLock(store, lockRelPath, owner);
        }
        return;
      } catch (error) {
        if (!this.#isNodeError(error, "EEXIST")) throw error;
        const mtimeMs = await store.mtime(lockRelPath);
        if (mtimeMs !== null && Date.now() - mtimeMs > this.#LOCK_STALE_MS) {
          await this.#removeStaleLock(store, lockRelPath);
          continue;
        }
        await this.#sleep(this.#LOCK_RETRY_MS);
      }
    }

    throw new Error(`Timed out acquiring drill result lock: ${lockPath}`);
  }

  static async #removeStaleLock(
    store: FileStore,
    lockRelPath: string,
  ): Promise<void> {
    const recoveryRelPath = `${lockRelPath}.recovery`;
    const recovery = await this.#acquireRecoveryLock(store, recoveryRelPath);
    if (!recovery) return;

    try {
      const mtimeMs = await store.mtime(lockRelPath);
      const owner = await this.#readLockOwner(store, lockRelPath);
      if (
        mtimeMs !== null &&
        Date.now() - mtimeMs > this.#LOCK_STALE_MS &&
        (!owner || !this.#isProcessAlive(owner.pid))
      ) {
        await store.remove(lockRelPath);
      }
    } finally {
      await recovery.handle.close().catch(() => undefined);
      await this.#removeOwnedLock(store, recoveryRelPath, recovery.owner);
    }
  }

  static async #acquireRecoveryLock(
    store: FileStore,
    recoveryRelPath: string,
  ): Promise<{
    handle: fs.FileHandle;
    owner: TreeDevDrillStore.LockOwner;
  } | null> {
    const recoveryPath = store.resolve(recoveryRelPath);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const handle = await fs.open(recoveryPath, "wx");
        const owner = this.#createLockOwner();
        await handle.writeFile(JSON.stringify(owner));
        return { handle, owner };
      } catch (error) {
        if (!this.#isNodeError(error, "EEXIST")) throw error;
        const mtimeMs = await store.mtime(recoveryRelPath);
        const owner = await this.#readLockOwner(store, recoveryRelPath);
        if (
          mtimeMs !== null &&
          Date.now() - mtimeMs > this.#LOCK_STALE_MS &&
          (!owner || !this.#isProcessAlive(owner.pid))
        ) {
          await store.remove(recoveryRelPath).catch(() => undefined);
          continue;
        }
        return null;
      }
    }
    return null;
  }

  static #createLockOwner(): TreeDevDrillStore.LockOwner {
    return { pid: process.pid, token: crypto.randomUUID() };
  }

  static async #readLockOwner(
    store: FileStore,
    relPath: string,
  ): Promise<TreeDevDrillStore.LockOwner | null> {
    // NOTE: A crashed writer may leave an empty or malformed lock file, so
    // any read/parse/schema failure is treated as an unknown owner.
    return await store
      .readJson(relPath, TreeDevDrillStore.LockOwner)
      .catch(() => null);
  }

  static async #removeOwnedLock(
    store: FileStore,
    relPath: string,
    owner: TreeDevDrillStore.LockOwner,
  ): Promise<void> {
    const current = await this.#readLockOwner(store, relPath);
    if (current?.pid === owner.pid && current.token === owner.token) {
      await store.remove(relPath).catch(() => undefined);
    }
  }

  static #isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return !this.#isNodeError(error, "ESRCH");
    }
  }

  static #isNodeError(error: unknown, code: string): boolean {
    return error instanceof Error && "code" in error && error.code === code;
  }

  static #sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
