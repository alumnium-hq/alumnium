import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { FileStore } from "../../FileStore/FileStore.ts";
import { createMockDir } from "../../../tests/unit/mocks.ts";
import type { TreeDevDrill } from "./TreeDevDrill.ts";
import { TreeDevDrillStore } from "./TreeDevDrillStore.ts";

describe(TreeDevDrillStore, () => {
  it("creates, preserves, and updates aggregate entries", async () => {
    const dir = await createMockDir();
    const store = new TreeDevDrillStore(new FileStore(dir.path));

    await store.update("chrome-one", result("click", "first"));
    await store.update("chrome-two", result("type", "second"));
    await store.update("chrome-one", result("wait", "first"));

    const aggregate =
      await dir.readJson<Record<string, TreeDevDrill.TreeResult>>(
        "result.json",
      );
    expect(Object.keys(aggregate).toSorted()).toEqual([
      "chrome-one",
      "chrome-two",
    ]);
    expect(aggregate["chrome-one"]?.failures).toHaveLength(1);
    expect(aggregate["chrome-one"]?.failures[0]?.action).toBe("wait");
  });

  it("serializes concurrent updates", async () => {
    const dir = await createMockDir();
    const store = new TreeDevDrillStore(new FileStore(dir.path));

    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        store.update(`chrome-${index}`, result("click", String(index))),
      ),
    );

    const aggregate = await dir.readJson("result.json");
    expect(Object.keys(aggregate as object)).toHaveLength(20);
    expect(await dir.flatTree()).toEqual(["result.json"]);
  });

  it("preserves malformed JSON before replacing it", async () => {
    const dir = await createMockDir();
    const fileStore = new FileStore(dir.path);
    await fileStore.writeFile("result.json", "not json");
    const store = new TreeDevDrillStore(fileStore);

    await store.update("chrome-one", result("click", "failure"));

    const files = await dir.flatTree();
    expect(files).toContain("result.json");
    expect(files.some((file) => file.startsWith("result.json.corrupt-"))).toBe(
      true,
    );
    await expect(fs.readFile(store.resultPath, "utf-8")).resolves.toContain(
      "chrome-one",
    );
  });

  it("recovers stale locks without leaving recovery files", async () => {
    const dir = await createMockDir();
    const fileStore = new FileStore(dir.path);
    const store = new TreeDevDrillStore(fileStore);
    const lockPath = `${store.resultPath}.lock`;
    await fileStore.writeFile("result.json.lock", "stale-owner");
    const stale = new Date(Date.now() - 60_000);
    await fs.utimes(lockPath, stale, stale);

    await store.update("chrome-one", result("click", "failure"));

    expect(await dir.flatTree()).toEqual(["result.json"]);
  });
});

function result(action: string, error: string): TreeDevDrill.TreeResult {
  return {
    platform: "chromium",
    input: "<input/>",
    output: "<output/>",
    failures: [
      {
        action,
        stage: "probe",
        ids: { parsed: "1", simplified: 1, raw: 2, external: 3 },
        error,
      },
    ],
  };
}
