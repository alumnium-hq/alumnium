import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import type { BrowserContext, Download } from "playwright-core";
import { describe, expect, it } from "vitest";
import { FileStore } from "@alumnium/core/internal";
import {
  createMockDir,
  setupBeforeEach,
} from "../../../alumnium/tests/unit/mocks.ts";
import { McpDownloads } from "./McpDownloads.ts";

describe("McpDownloads", () => {
  const setup = setupBeforeEach(async () => {
    const mockDir = await createMockDir();
    const downloads = new McpDownloads(new FileStore(mockDir.path));
    const context = new FakeContext();
    const page = context.openPage();
    downloads.watch(context.asContext());
    return { mockDir, downloads, context, page };
  });

  it("saves a download under its suggested name and reports it once", async () => {
    const { mockDir, downloads, page } = setup.cur;
    page.emit("download", fakeDownload("report.csv", "Site\nDublin\n"));

    const report = await downloads.report();

    expect(report).toEqual({ downloads: [{ file: "report.csv", bytes: 12 }] });
    expect(await mockDir.readText("downloads/report.csv")).toBe(
      "Site\nDublin\n",
    );
    expect(await mockDir.flatTree()).toEqual(["downloads/report.csv"]);
    expect(await downloads.report()).toEqual({});
  });

  it("reports nothing, without waiting, when nothing was downloaded", async () => {
    const { mockDir, downloads } = setup.cur;

    expect(await downloads.report()).toEqual({});
    expect(await mockDir.flatTree()).toEqual([]);
  });

  it("saves downloads from pages opened after it started watching", async () => {
    const { downloads, context } = setup.cur;
    const popup = context.openPage();
    popup.emit("download", fakeDownload("popup.csv", "a"));

    const report = await downloads.report();

    expect(report.downloads).toEqual([{ file: "popup.csv", bytes: 1 }]);
  });

  it("keeps every copy when the same name is downloaded again", async () => {
    const { mockDir, downloads, page } = setup.cur;
    page.emit("download", fakeDownload("report.csv", "first"));
    page.emit("download", fakeDownload("report.csv", "second"));
    await downloads.report();
    page.emit("download", fakeDownload("report.csv", "third"));

    const report = await downloads.report();

    expect(report.downloads).toEqual([{ file: "report-3.csv", bytes: 5 }]);
    expect(await mockDir.readText("downloads/report.csv")).toBe("first");
    expect(await mockDir.readText("downloads/report-2.csv")).toBe("second");
  });

  it("does not overwrite a file left by an earlier session with the same id", async () => {
    const { mockDir, downloads, page } = setup.cur;
    await fs.mkdir(path.join(mockDir.path, "downloads"));
    await fs.writeFile(path.join(mockDir.path, "downloads/report.csv"), "old");
    page.emit("download", fakeDownload("report.csv", "new"));

    const report = await downloads.report();

    expect(report.downloads).toEqual([{ file: "report-2.csv", bytes: 3 }]);
    expect(await mockDir.readText("downloads/report.csv")).toBe("old");
  });

  it("never saves outside the downloads directory", async () => {
    const { mockDir, downloads, page } = setup.cur;
    page.emit("download", fakeDownload("../../escaped.csv", "a"));

    const report = await downloads.report();

    expect(report.downloads).toEqual([{ file: "escaped.csv", bytes: 1 }]);
    expect(await mockDir.flatTree()).toEqual(["downloads/escaped.csv"]);
  });

  it("reports a failed download as an error and leaves no file behind", async () => {
    const { mockDir, downloads, page } = setup.cur;
    page.emit("download", fakeDownload("report.csv", new Error("canceled")));

    const report = await downloads.report();

    expect(report).toEqual({ download_errors: ["report.csv: canceled"] });
    expect(await mockDir.flatTree()).toEqual([]);
  });

  it("stops waiting for a slow download and reports the file once it completes", async () => {
    const { mockDir, downloads, page } = setup.cur;
    const slow = Promise.withResolvers<void>();
    page.emit("download", fakeDownload("big.zip", "data", slow.promise));

    const early = await downloads.report(10);

    expect(early).toEqual({
      download_errors: ["A download was still in progress after 0.01 seconds"],
    });
    // Only the finished name is a download: a reader must never pick up a half-written file.
    expect(await mockDir.flatTree()).toEqual([]);

    slow.resolve();
    const late = await downloads.report();

    expect(late).toEqual({ downloads: [{ file: "big.zip", bytes: 4 }] });
  });
});

class FakeContext extends EventEmitter {
  #pages: EventEmitter[] = [];

  openPage(): EventEmitter {
    const page = new EventEmitter();
    this.#pages.push(page);
    this.emit("page", page);
    return page;
  }

  pages(): EventEmitter[] {
    return this.#pages;
  }

  asContext(): BrowserContext {
    // @ts-expect-error -- Only the events and `pages` are used
    return this;
  }
}

/** A download whose `saveAs` writes `content`, or rejects with it, once `ready` resolves. */
function fakeDownload(
  suggestedFilename: string,
  content: string | Error,
  ready: Promise<void> = Promise.resolve(),
): Download {
  const download: Pick<Download, "suggestedFilename" | "saveAs"> = {
    suggestedFilename: () => suggestedFilename,
    async saveAs(filePath) {
      await ready;
      if (content instanceof Error) throw content;
      await fs.writeFile(filePath, content);
    },
  };
  // @ts-expect-error -- Only the methods above are used
  return download;
}
