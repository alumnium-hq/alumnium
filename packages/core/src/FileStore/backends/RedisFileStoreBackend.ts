import path from "node:path";
import { createClient } from "redis";
import { getLogger } from "../../utils/logger.js";
import type { FileStore } from "../FileStore.js";

const logger = getLogger(import.meta.url);

export namespace RedisFileStoreBackend {
  export interface Init extends FileStore.BackendInit<"redis"> {
    url: string;
  }
}

export class RedisFileStoreBackend implements FileStore.Backend {
  static #clients: Record<string, Promise<ReturnType<typeof createClient>>> =
    {};

  #client: Promise<ReturnType<typeof createClient>>;

  constructor(init: RedisFileStoreBackend.Init) {
    this.#client = this.#getClient(init.url);
  }

  async ensureFilePath(storeDir: string, relPath: string): Promise<string> {
    return path.join(storeDir, relPath);
  }

  async ensureDir(storeDir: string, relPath: string): Promise<string> {
    return path.join(storeDir, relPath);
  }

  async writeFile(
    storeDir: string,
    relPath: string,
    data: Buffer | string,
  ): Promise<string> {
    const filePath = path.join(storeDir, relPath);
    const client = await this.#client;
    await client.set(
      this.#key(filePath),
      Buffer.isBuffer(data) ? data.toString("utf-8") : data,
    );
    return filePath;
  }

  async readText(storeDir: string, relPath: string): Promise<string | null> {
    const client = await this.#client;
    const data = await client.get(this.#key(path.join(storeDir, relPath)));
    return data;
  }

  async clear(storeDir: string): Promise<void> {
    const client = await this.#client;
    const prefix = `${this.#key(storeDir)}/`;
    const keys = await this.#scanKeys(client, `${prefix}*`);
    if (!keys.length) return;
    await client.sendCommand(["DEL", ...keys]);
  }

  async listDirs(storeDir: string, relPath: string): Promise<string[]> {
    const client = await this.#client;
    const prefix = this.#dirPrefix(path.join(storeDir, relPath));
    const keys = await this.#scanKeys(client, `${prefix}*`);
    const dirs: Record<string, true> = {};

    for (const key of keys) {
      if (!key.startsWith(prefix)) continue;
      const suffix = key.slice(prefix.length);
      const [dir] = suffix.split("/");
      if (!dir) continue;
      dirs[dir] = true;
    }

    return Object.keys(dirs);
  }

  #key(filePath: string): string {
    return normalizePath(filePath);
  }

  #dirPrefix(dirPath: string): string {
    return `${normalizePath(dirPath)}/`;
  }

  #getClient(url: string): Promise<ReturnType<typeof createClient>> {
    if (RedisFileStoreBackend.#clients[url]) {
      return RedisFileStoreBackend.#clients[url];
    }

    const client = createClient({
      url,
    });

    client.on("error", (error) => {
      logger.warn(`Redis backend error: ${error}`);
    });

    const connectPromise = client.connect().then(() => client);
    RedisFileStoreBackend.#clients[url] = connectPromise;
    return connectPromise;
  }

  async #scanKeys(
    client: ReturnType<typeof createClient>,
    match: string,
  ): Promise<string[]> {
    const keys: string[] = [];
    for await (const key of client.scanIterator({
      MATCH: match,
      COUNT: 1000,
    })) {
      if (Array.isArray(key)) {
        keys.push(...key);
      } else {
        keys.push(key);
      }
    }
    return keys;
  }
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\/+/, "");
}
