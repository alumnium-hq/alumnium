import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { BrowserContext, Download, Page } from "playwright-core";
import { type FileStore, Logger } from "@alumnium/core/internal";

const logger = Logger.get(import.meta.url);

/** How long a tool call waits for the downloads it started before returning without them. */
const WAIT_MS = 30_000;

export namespace McpDownloads {
  export interface Saved {
    /** File name inside the session's `downloads` artifacts directory. */
    file: string;
    bytes: number;
  }

  /** Fields a tool adds to its result. Both are absent when nothing was downloaded. */
  export interface Report {
    downloads?: Saved[];
    download_errors?: string[];
  }
}

/**
 * Saves the files a Playwright browser downloads into the session's artifacts.
 *
 * Playwright keeps a download in a temporary directory under a random name and deletes it when
 * the context closes, so without this a caller has no way to look at an exported file.
 */
export class McpDownloads {
  static readonly DIR = "downloads";
  /** A file is saved under this suffix and renamed when complete, so readers never see half of it. */
  static readonly PARTIAL_SUFFIX = ".part";

  #store: FileStore;
  #pending = new Set<Promise<void>>();
  #names = new Set<string>();
  #saved: McpDownloads.Saved[] = [];
  #errors: string[] = [];

  constructor(store: FileStore) {
    this.#store = store;
  }

  /**
   * Starts saving downloads from every page of the context, including pages opened later.
   * Playwright reports downloads per page; there is no context-level event.
   */
  watch(context: BrowserContext): void {
    const watchPage = (page: Page) =>
      page.on("download", (download) => this.#track(download));
    context.pages().forEach(watchPage);
    context.on("page", watchPage);
  }

  /**
   * Waits for the downloads in progress, then returns everything that finished since the last
   * report. A download that outlasts the wait is named in `download_errors` and is reported
   * again, as a file, by a later call once it completes.
   */
  async report(waitMs = WAIT_MS): Promise<McpDownloads.Report> {
    const timedOut = await this.#wait(waitMs);
    const downloads = this.#saved.splice(0);
    const errors = this.#errors.splice(0);
    if (timedOut)
      errors.push(
        `A download was still in progress after ${waitMs / 1000} seconds`,
      );
    return {
      ...(downloads.length ? { downloads } : {}),
      ...(errors.length ? { download_errors: errors } : {}),
    };
  }

  #track(download: Download): void {
    // The server suggests the name, so only its last segment is trusted.
    const suggested = path.basename(download.suggestedFilename()) || "download";
    // Named before anything is awaited, so files are numbered in the order downloads started.
    const file = this.#reserveName(suggested);
    const pending = this.#save(download, file).finally(() =>
      this.#pending.delete(pending),
    );
    this.#pending.add(pending);
  }

  async #save(download: Download, file: string): Promise<void> {
    try {
      const filePath = await this.#store.ensureFilePath(
        path.join(McpDownloads.DIR, file),
      );
      const partialPath = filePath + McpDownloads.PARTIAL_SUFFIX;
      // Waits for the download to finish, and rejects when it fails or is canceled.
      await download.saveAs(partialPath);
      await fs.rename(partialPath, filePath);
      const { size: bytes } = await fs.stat(filePath);
      this.#saved.push({ file, bytes });
      logger.info(`Saved download ${filePath} (${bytes} bytes)`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.#errors.push(`${file}: ${reason}`);
      logger.warn(`Download ${file} failed: ${reason}`);
    }
  }

  /**
   * Picks a free name, adding `-2`, `-3`, … before the extension: a retried action downloads the
   * same file again. Synchronous, so two downloads starting together cannot pick the same name.
   * A name stays taken after a failed download.
   */
  #reserveName(suggested: string): string {
    const dir = this.#store.resolve(McpDownloads.DIR);
    const { name, ext } = path.parse(suggested);
    let file = suggested;
    for (
      let n = 2;
      this.#names.has(file) || existsSync(path.join(dir, file));
      n++
    ) {
      file = `${name}-${n}${ext}`;
    }
    this.#names.add(file);
    return file;
  }

  /** Resolves `true` when downloads are still in progress after `waitMs`. */
  async #wait(waitMs: number): Promise<boolean> {
    if (!this.#pending.size) return false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(true), waitMs);
    });
    const settled = Promise.all(this.#pending).then(() => false);
    return Promise.race([settled, timeout]).finally(() => clearTimeout(timer));
  }
}
