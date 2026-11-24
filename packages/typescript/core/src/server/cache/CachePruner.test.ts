import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createMockDir } from "../../../../alumnium/tests/unit/mocks.ts";
import { CachePruner } from "./CachePruner.ts";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe(CachePruner, () => {
  describe("entries", () => {
    it("lists response and elements entries", async () => {
      const { cacheDir, pruner } = await setup();
      await writeEntry(cacheDir.path, "app/openai/gpt/responses/a", 100, DAY);
      await writeEntry(
        cacheDir.path,
        "app/openai/gpt/elements/actor/b",
        200,
        2 * DAY,
        ["elements.json", "instruction.json"],
      );

      const entries = await pruner.entries();

      expect(
        entries
          .sort((a, b) => a.dir.localeCompare(b.dir))
          .map(({ dir, size }) => [path.relative(cacheDir.path, dir), size]),
      ).toEqual([
        ["app/openai/gpt/elements/actor/b", 204],
        ["app/openai/gpt/responses/a", 100],
      ]);
    });

    it("ignores hidden directories and files outside entries", async () => {
      const { cacheDir, pruner } = await setup();
      await writeEntry(cacheDir.path, ".trial/app/responses/a", 100, DAY);
      await fs.mkdir(path.join(cacheDir.path, "tests"));
      await fs.writeFile(path.join(cacheDir.path, "tests/recording.json"), "");

      expect(await pruner.entries()).toEqual([]);
    });
  });

  describe("prune", () => {
    it("keeps the cache when it's under the max size", async () => {
      const { cacheDir, pruner } = await setup();
      await writeEntry(cacheDir.path, "app/responses/a", 100, 30 * DAY);

      const result = await pruner.prune({ maxSize: 100 });

      expect(result).toEqual({
        entries: 1,
        size: 100,
        removedEntries: 0,
        removedSize: 0,
      });
      expect(await remainingEntries(cacheDir.path, pruner)).toEqual([
        "app/responses/a",
      ]);
    });

    it("removes the least recently used entries down to 90% of the max size", async () => {
      const { cacheDir, pruner } = await setup();
      await writeEntry(cacheDir.path, "app/responses/oldest", 100, 4 * DAY);
      await writeEntry(cacheDir.path, "app/responses/older", 100, 3 * DAY);
      await writeEntry(cacheDir.path, "app/responses/old", 100, 2 * DAY);
      await writeEntry(cacheDir.path, "app/responses/recent", 100, DAY);

      const result = await pruner.prune({ maxSize: 300 });

      expect(result).toEqual({
        entries: 4,
        size: 400,
        removedEntries: 2,
        removedSize: 200,
      });
      expect(await remainingEntries(cacheDir.path, pruner)).toEqual([
        "app/responses/old",
        "app/responses/recent",
      ]);
    });

    it("keeps entries used within the grace period", async () => {
      const { cacheDir, pruner } = await setup();
      await writeEntry(cacheDir.path, "app/responses/old", 100, DAY);
      await writeEntry(cacheDir.path, "app/responses/fresh", 100, HOUR / 2);

      const result = await pruner.prune({ maxSize: 50 });

      expect(result?.removedEntries).toBe(1);
      expect(await remainingEntries(cacheDir.path, pruner)).toEqual([
        "app/responses/fresh",
      ]);
    });

    it("removes entries unused for longer than the max age", async () => {
      const { cacheDir, pruner } = await setup();
      await writeEntry(cacheDir.path, "app/responses/stale", 100, 10 * DAY);
      await writeEntry(cacheDir.path, "app/responses/used", 100, 2 * DAY);

      await pruner.prune({ maxAge: 7 * DAY });

      expect(await remainingEntries(cacheDir.path, pruner)).toEqual([
        "app/responses/used",
      ]);
    });

    it("skips pruning while another process holds the lock", async () => {
      const { cacheDir, pruner } = await setup();
      await writeEntry(cacheDir.path, "app/responses/a", 100, DAY);
      await fs.writeFile(path.join(cacheDir.path, ".prune.lock"), "1");

      expect(await pruner.prune({ maxSize: 0 })).toBeNull();
      expect(await remainingEntries(cacheDir.path, pruner)).toEqual([
        "app/responses/a",
      ]);
    });

    it("takes over a stale lock", async () => {
      const { cacheDir, pruner } = await setup();
      await writeEntry(cacheDir.path, "app/responses/a", 100, DAY);
      const lockPath = path.join(cacheDir.path, ".prune.lock");
      await fs.writeFile(lockPath, "1");
      await setAge(lockPath, HOUR);

      expect(await pruner.prune({ maxSize: 0 })).toMatchObject({
        removedEntries: 1,
      });
      expect(await fs.stat(lockPath).catch(() => null)).toBeNull();
    });

    it("removes trash left by an interrupted prune", async () => {
      const { cacheDir, pruner } = await setup();
      await writeEntry(cacheDir.path, ".trash-leftover", 100, DAY);

      await pruner.prune({ maxSize: 1000 });

      expect(await fs.readdir(cacheDir.path)).toEqual([]);
    });

    it("handles a missing cache directory", async () => {
      const { cacheDir } = await setup();
      const pruner = new CachePruner(path.join(cacheDir.path, "missing"));

      expect(await pruner.prune({ maxSize: 0 })).toEqual({
        entries: 0,
        size: 0,
        removedEntries: 0,
        removedSize: 0,
      });
    });
  });
});

async function setup() {
  const cacheDir = await createMockDir({ prefix: "cache-pruner" });
  return { cacheDir, pruner: new CachePruner(cacheDir.path) };
}

async function writeEntry(
  rootDir: string,
  relDir: string,
  responseSize: number,
  lastUsedAgo: number,
  extraFiles: string[] = [],
): Promise<void> {
  const dir = path.join(rootDir, relDir);
  await fs.mkdir(dir, { recursive: true });
  const responsePath = path.join(dir, "response.json");
  await fs.writeFile(responsePath, "x".repeat(responseSize));
  await Promise.all(
    extraFiles.map((name) => fs.writeFile(path.join(dir, name), "[]")),
  );
  await setAge(responsePath, lastUsedAgo);
}

async function setAge(filePath: string, age: number): Promise<void> {
  const time = new Date(Date.now() - age);
  await fs.utimes(filePath, time, time);
}

async function remainingEntries(
  rootDir: string,
  pruner: CachePruner,
): Promise<string[]> {
  const entries = await pruner.entries();
  return entries.map((entry) => path.relative(rootDir, entry.dir)).sort();
}
