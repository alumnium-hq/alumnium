import { always, never } from "alwaysly";
import path from "path";
import type z from "zod";
import { getLogger } from "../utils/logger.js";
import { FsFileStoreBackend } from "./backends/FsFileStoreBackend.js";
import { RedisFileStoreBackend } from "./backends/RedisFileStoreBackend.js";
import { S3FileStoreBackend } from "./backends/S3FileStoreBackend.js";

const logger = getLogger(import.meta.url);

const DEFAULT_GLOBAL_STORE_DIR = ".alumnium";

export namespace FileStore {
  export type DirGetter = () => string;

  export interface Backend {
    ensureFilePath(storeDir: string, relPath: string): Promise<string>;
    ensureDir(storeDir: string, relPath: string): Promise<string>;
    writeFile(
      storeDir: string,
      relPath: string,
      data: Buffer | string,
    ): Promise<string>;
    readText(storeDir: string, relPath: string): Promise<string | null>;
    clear(storeDir: string): Promise<void>;
    listDirs(storeDir: string, relPath: string): Promise<string[]>;
  }

  export interface BackendInit<Kind extends string> {
    kind: Kind;
  }

  export type BackendOption =
    | "fs"
    | RedisFileStoreBackend.Init
    | S3FileStoreBackend.Init;

  export interface Options {
    backend?: BackendOption | undefined;
  }
}

/**
 * File system-based store for state persistence, caching, artifacts, etc.
 */
export class FileStore {
  protected static DYNAMIC_DIR_SYMBOL = Symbol();
  #backendOption: FileStore.BackendOption | undefined;
  #backend: FileStore.Backend;

  /**
   * Creates a new FileStore instance for the specified directory. When the
   * `dir` parameter is `FileStore.DYNAMIC_DIR_SYMBOL`, the store is expected to
   * implement dynamic directory resolution by overriding the `dir` getter.
   *
   * @param dir Directory path for the store or `FileStore.DYNAMIC_DIR_SYMBOL` for dynamic resolution.
   */
  constructor(
    dir: string | typeof FileStore.DYNAMIC_DIR_SYMBOL,
    options: FileStore.Options = {},
  ) {
    this.#backendOption = options.backend;
    this.#backend = this.#createBackend(options.backend);

    // NOTE: This is done, so that internal methods always use the dir getter.
    // It allows subclasses to override the dir getter to provide dynamic
    // directory paths if needed, i.e., for dynamic cache resolution based on
    // app and model.
    if (dir === FileStore.DYNAMIC_DIR_SYMBOL) return;
    always(typeof dir === "string");
    this.defineDir(() => dir);
  }

  #createBackend(
    backend: FileStore.BackendOption | undefined,
  ): FileStore.Backend {
    if (!backend || backend === "fs") return new FsFileStoreBackend();

    switch (backend.kind) {
      case "redis":
        return new RedisFileStoreBackend(backend);
      case "s3":
        return new S3FileStoreBackend(backend);
    }
  }

  protected defineDir(get: FileStore.DirGetter) {
    Object.defineProperty(this, "dir", {
      get,
      enumerable: true,
      configurable: true,
    });
  }

  /**
   * Store directory path.
   */
  get dir(): string {
    // NOTE: See note in the constructor.
    never();
    return "";
  }

  /**
   * Resolves a relative path against the store's directory. It doesn't create
   * the directory structure or check for file existence.
   *
   * @param relPath Store-relative path
   * @returns Resolved absolute path.
   */
  resolve(relPath: string): string {
    return path.join(this.dir, relPath);
  }

  /**
   * Ensures that a file exists at the specified relative path, creating any
   * necessary directories. Returns the resolved file path.
   *
   * @param relPath Store-relative file path
   * @returns The resolved file path.
   */
  async ensureFilePath(relPath: string): Promise<string> {
    return this.#backend.ensureFilePath(this.dir, relPath);
  }

  /**
   * Ensures that a directory exists at the specified relative path, creating it
   * if necessary. Returns the resolved directory path.
   *
   * @param relPath Store-relative directory path
   * @returns The resolved directory path.
   */
  async ensureDir(relPath: string): Promise<string> {
    return this.#backend.ensureDir(this.dir, relPath);
  }

  /**
   * Writes JSON-serializable data to a file at the specified relative path,
   * ensuring that the directory structure exists. Returns the resolved file path
   * after writing.
   *
   * @param relPath Store-relative file path
   * @param data JSON-serializable data to write to the file.
   * @returns The resolved file path.
   */
  async writeJson(relPath: string, data: unknown): Promise<string> {
    const filePath = this.resolve(relPath);
    logger.debug(`Writing JSON file ${filePath}...`);
    return this.#backend.writeFile(
      this.dir,
      relPath,
      JSON.stringify(data, null, 2),
    );
  }

  /**
   * Writes data to a file at the specified relative path, ensuring that the
   * directory structure exists. Returns the resolved file path after writing.
   *
   * @param relPath Store-relative file path
   * @param data Data to write to the file.
   * @returns The resolved file path.
   */
  async writeFile(relPath: string, data: Buffer | string): Promise<string> {
    const filePath = this.resolve(relPath);
    logger.debug(`Writing file ${filePath}...`);
    return this.#backend.writeFile(this.dir, relPath, data);
  }

  /**
   * Reads file content as a string from the specified relative path. If
   * the file doesn't exist, it returns null.
   */
  async readText(relPath: string): Promise<string | null> {
    return this.#backend.readText(this.dir, relPath);
  }

  /**
   * Reads file content as JSON from the specified relative path. If
   * the file doesn't exist, it returns null.
   */
  async readJson<Type>(
    relPath: string,
    Schema?: z.Schema<Type>,
  ): Promise<Type | null> {
    const content = await this.readText(relPath);
    if (content === null) return null;
    const obj = JSON.parse(content);
    if (Schema) return Schema.parse(obj);
    return obj as Type;
  }

  /**
   * Removes the store directory.
   */
  async clear(): Promise<void> {
    await this.#backend.clear(this.dir);
  }

  /**
   * Lists direct subdirectory names under the specified relative path.
   *
   * @param relPath Store-relative directory path
   * @returns Direct subdirectory names (without path prefix).
   */
  async listDirs(relPath = ""): Promise<string[]> {
    return this.#backend.listDirs(this.dir, relPath);
  }

  /**
   * Creates a sub-store under the current store directory. The subdirectory is
   * resolved from the specified relative (to the current store directory) path.
   *
   * @param subDir Relative subdirectory path.
   * @returns FileStore instance for the resolved subdirectory.
   */
  subStore(subDir: string): FileStore {
    if (path.isAbsolute(subDir))
      throw new RangeError(
        `Subdirectory path '${subDir}' must be relative to the store directory '${this.dir}'`,
      );
    return new FileStore(path.join(this.dir, subDir), {
      backend: this.#backendOption,
    });
  }

  /**
   * Creates a sub-store under the global store directory. The subdirectory can
   * be configured via environment variable or resolved from the specified
   * relative (to the global store directory `.alumnium`) path.
   *
   * @param envDir Environment variable value, e.g. `process.env.ALUMNIUM_MCP_ARTIFACTS_DIR`.
   * @param defaultDir Default subdirectory under global store, e.g. `artifacts`.
   * @param nestedDir Optional nested directory under the resolved subdirectory, e.g. driver ID.
   * @returns FileStore instance for the resolved directory.
   */
  static subStore(
    envDir: string | undefined,
    defaultDir: string,
    nestedDir?: string,
  ): FileStore {
    return new FileStore(this.subResolve(envDir, defaultDir, nestedDir));
  }

  /**
   * Resolves a subdirectory path under the global store directory, allowing
   * override via environment variable.
   *
   * @param envDir Environment variable value, e.g. `process.env.ALUMNIUM_MCP_ARTIFACTS_DIR`.
   * @param defaultDir Default subdirectory under global store, e.g. `artifacts`.
   * @param nestedDir Optional nested directory under the resolved subdirectory, e.g. driver ID.
   * @returns Resolved path.
   */
  static subResolve(
    envDir: string | undefined,
    defaultDir: string,
    nestedDir?: string,
  ): string {
    return path.join(envDir ?? this.globalSubDir(defaultDir), nestedDir ?? "");
  }

  /**
   * Resolves a subdirectory path under the global store directory.
   *
   * @param dir Relative subdirectory path.
   * @returns The resolved path.
   */
  static globalSubDir(dir: string): string {
    return path.join(this.globalDir, dir);
  }

  /**
   * Returns the global store directory path, which can be overridden via
   * the `ALUMNIUM_STORE_DIR` environment variable. It defaults to `.alumnium`.
   * @returns The global store directory path.
   */
  static get globalDir(): string {
    return process.env.ALUMNIUM_STORE_DIR ?? DEFAULT_GLOBAL_STORE_DIR;
  }
}
