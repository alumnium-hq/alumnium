import { Env } from "../Env.ts";
import { safePathJoin } from "../utils/fs.ts";

export abstract class GlobalFileStorePaths {
  /**
   * Returns the global store directory path, which can be overridden via
   * the `ALUMNIUM_STORE_DIR` environment variable. It defaults to `.alumnium`.
   * @returns The global store directory path.
   */
  static get globalDir(): string {
    return Env.ALUMNIUM_STORE_DIR;
  }

  /**
   * Resolves a subdirectory path under the global store directory.
   *
   * @param dir Relative subdirectory path.
   * @returns The resolved path.
   */
  static globalSubDir(dir: string): string {
    return safePathJoin(this.globalDir, dir);
  }
}
