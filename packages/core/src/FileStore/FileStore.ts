import { always, never } from "alwaysly";
import fs from "fs/promises";
import path from "path";
import type z from "zod";
import { getLogger } from "../utils/logger.js";
import { GlobalFileStorePaths } from "./GlobalFileStorePaths.js";

const logger = getLogger(import.meta.url);

export namespace FileStore {
  export type DirGetter = () => string;
}

/**
 * File system-based store for state persistence, caching, artifacts, etc.
 */
export class FileStore {
  protected static DYNAMIC_DIR_SYMBOL = Symbol();

  /**
   * Creates a new FileStore instance for the specified directory. When the
   * `dir` parameter is `FileStore.DYNAMIC_DIR_SYMBOL`, the store is expected to
   * implement dynamic directory resolution by overriding the `dir` getter.
   *
   * @param dir Directory path for the store or `FileStore.DYNAMIC_DIR_SYMBOL` for dynamic resolution.
   */
  constructor(dir: string | typeof FileStore.DYNAMIC_DIR_SYMBOL) {
    // NOTE: This is done, so that internal methods always use the dir getter.
    // It allows subclasses to override the dir getter to provide dynamic
    // directory paths if needed, i.e., for dynamic cache resolution based on
    // app and model.
    if (dir === FileStore.DYNAMIC_DIR_SYMBOL) return;
    always(typeof dir === "string");
    this.defineDir(() => dir);
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
    const filePath = this.resolve(relPath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    return filePath;
  }

  /**
   * Ensures that a directory exists at the specified relative path, creating it
   * if necessary. Returns the resolved directory path.
   *
   * @param relPath Store-relative directory path
   * @returns The resolved directory path.
   */
  async ensureDir(relPath: string): Promise<string> {
    const storeDir = this.resolve(relPath);
    await fs.mkdir(storeDir, { recursive: true });
    return storeDir;
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
    const filePath = await this.ensureFilePath(relPath);
    logger.debug(`Writing JSON file ${filePath}...`);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    return filePath;
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
    const filePath = await this.ensureFilePath(relPath);
    logger.debug(`Writing file ${filePath}...`);
    await fs.writeFile(filePath, data);
    return filePath;
  }

  /**
   * Reads file content as a string from the specified relative path. If
   * the file doesn't exist, it returns null.
   */
  async readText(relPath: string): Promise<string | null> {
    const filePath = this.resolve(relPath);
    return fs.readFile(filePath, "utf-8").catch(() => null);
  }

  /**
   * Reads file content as JSON from the specified relative path. If
   * the file doesn't exist, it returns null.
   */
  async readJson<Type>(
    relPath: string,
    Schema?: z.Schema<Type>,
  ): Promise<Type | null> {
    const filePath = this.resolve(relPath);
    const content = await fs.readFile(filePath, "utf-8").catch(() => null);
    if (content === null) return null;
    const obj = JSON.parse(content);
    if (Schema) return Schema.parse(obj);
    return obj as Type;
  }

  /**
   * Removes the store directory.
   */
  async clear(): Promise<void> {
    await fs.rm(this.dir, { recursive: true, force: true });
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
    return new FileStore(path.join(this.dir, subDir));
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
    return path.join(
      envDir ?? GlobalFileStorePaths.globalSubDir(defaultDir),
      nestedDir ?? "",
    );
  }
}
