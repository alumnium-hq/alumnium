import fs from "node:fs/promises";
import path from "node:path";
import type { FileStore } from "../FileStore.js";

export class FsFileStoreBackend implements FileStore.Backend {
  async ensureFilePath(storeDir: string, relPath: string): Promise<string> {
    const filePath = path.join(storeDir, relPath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    return filePath;
  }

  async ensureDir(storeDir: string, relPath: string): Promise<string> {
    const dirPath = path.join(storeDir, relPath);
    await fs.mkdir(dirPath, { recursive: true });
    return dirPath;
  }

  async writeFile(
    storeDir: string,
    relPath: string,
    data: Buffer | string,
  ): Promise<string> {
    const filePath = await this.ensureFilePath(storeDir, relPath);
    await fs.writeFile(filePath, data);
    return filePath;
  }

  async readText(storeDir: string, relPath: string): Promise<string | null> {
    const filePath = path.join(storeDir, relPath);
    return fs.readFile(filePath, "utf-8").catch(() => null);
  }

  async clear(storeDir: string): Promise<void> {
    await fs.rm(storeDir, { recursive: true, force: true });
  }

  async listDirs(storeDir: string, relPath: string): Promise<string[]> {
    const dirPath = path.join(storeDir, relPath);
    const entries = await fs
      .readdir(dirPath, { withFileTypes: true })
      .catch(() => []);
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  }
}
