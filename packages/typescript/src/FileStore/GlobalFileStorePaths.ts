import path from "node:path";

const DEFAULT_GLOBAL_STORE_DIR = ".alumnium";

export abstract class GlobalFileStorePaths {
  /**
   * Returns the global store directory path, which can be overridden via
   * the `ALUMNIUM_STORE_DIR` environment variable. It defaults to `.alumnium`.
   * @returns The global store directory path.
   */
  static get globalDir(): string {
    return process.env.ALUMNIUM_STORE_DIR ?? DEFAULT_GLOBAL_STORE_DIR;
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
}
