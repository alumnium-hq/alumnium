import {
  FileStore,
  GlobalFileStorePaths,
  safePathJoin,
} from "@alumnium/core/internal";
import { xxh32Str } from "@js-fns/xxhash/str";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import z from "zod";

export namespace CliSessionRegistry {
  export type Entry = z.infer<typeof CliSessionRegistry.Entry>;
}

/**
 * Session entries in `<store>/cli/<session>.json`, one per running daemon.
 */
export class CliSessionRegistry extends FileStore {
  static SessionName = z.coerce
    .string()
    .regex(
      /^[\w-]{1,24}$/,
      "Session name must be 1-24 letters, digits, '_' or '-'",
    );

  static Entry = z.object({
    name: CliSessionRegistry.SessionName,
    version: z.string(),
    pid: z.number(),
    socketPath: z.string(),
    driverId: z.string(),
    platform: z.string(),
    startedAt: z.number(),
    startOutput: z.string(),
  });

  #hash: string;

  constructor(dir = GlobalFileStorePaths.globalSubDir("cli")) {
    super(dir);
    // NOTE: Keep it short, Unix socket paths are limited to 104 bytes on macOS.
    this.#hash = xxh32Str(path.resolve(dir));
  }

  socketPath(name: string): string {
    const base = `alumnium-cli-${this.#hash}-${name}`;
    return process.platform === "win32"
      ? `\\\\.\\pipe\\${base}`
      : safePathJoin(os.tmpdir(), `${base}.sock`);
  }

  /**
   * Daemon stdout/stderr log path.
   */
  logPath(name: string): string {
    return this.resolve(`${name}.log`);
  }

  async readEntry(name: string): Promise<CliSessionRegistry.Entry | undefined> {
    const text = await this.readText(`${name}.json`);
    const entry = CliSessionRegistry.Entry.safeParse(
      text && parseJson(text),
    ).data;
    // NOTE: A mismatched name would make callers touch another session's files.
    return entry?.name === name ? entry : undefined;
  }

  async writeEntry(entry: CliSessionRegistry.Entry): Promise<void> {
    await this.writeJson(`${entry.name}.json`, entry);
  }

  async removeEntry(name: string): Promise<void> {
    await this.remove(`${name}.json`);
    if (process.platform !== "win32")
      await fs.rm(this.socketPath(name), { force: true });
  }

  /**
   * Removes only the entry file, leaving the socket alone.
   */
  async removeEntryFile(name: string): Promise<void> {
    await this.remove(`${name}.json`);
  }

  /**
   * Removes the entry file only if it belongs to the given process.
   */
  removeEntryFileSyncIfOwned(name: string, pid: number) {
    const file = this.resolve(`${name}.json`);
    let text: string;
    try {
      text = fsSync.readFileSync(file, "utf-8");
    } catch {
      return;
    }
    if (CliSessionRegistry.Entry.safeParse(parseJson(text)).data?.pid === pid)
      fsSync.rmSync(file, { force: true });
  }

  async listEntries(): Promise<CliSessionRegistry.Entry[]> {
    const files = await fs.readdir(this.dir).catch(() => []);
    const entries = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map((file) => this.readEntry(path.basename(file, ".json"))),
    );
    return entries.filter((entry) => entry !== undefined);
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
