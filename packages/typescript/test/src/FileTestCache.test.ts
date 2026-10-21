import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { Env } from "@alumnium/core/internal";
import {
  createMockDir,
  setupBeforeEach,
} from "../../alumnium/tests/unit/mocks.ts";
import { FileTestCache } from "./FileTestCache.ts";
import { Recording } from "./Recording.ts";

function createRecording(text: string, version = 1): Recording.Type {
  return {
    id: Recording.textToId(text),
    version,
    text,
    agent: "test-agent",
    alumnium: { version: "0.0.0" },
    hostVars: [],
    steps: [{ kind: "narration", narration: "assistant", text: "Done" }],
    verdict: { status: "success", details: "" },
  };
}

describe("FileTestCache", () => {
  const dir = setupBeforeEach(() => createMockDir({ prefix: "test-cache" }));

  function createCache() {
    return new FileTestCache({ dir: dir.cur.path });
  }

  it("defaults to the tests directory of the cache path", () => {
    vi.spyOn(Env, "ALUMNIUM_CACHE_PATH", "get").mockReturnValue("/tmp/cache");

    expect(new FileTestCache().dir).toBe(path.join("/tmp/cache", "tests"));
  });

  it("misses a test with no recording", async () => {
    const cache = createCache();

    expect(await cache.lookup("test")).toBeNull();
    expect(cache.lookups).toEqual({ hits: 0, misses: 1 });
  });

  it("serves a staged recording before it is saved", async () => {
    const cache = createCache();
    await cache.update(createRecording("test"));

    expect(await cache.lookup("test")).toEqual(createRecording("test"));
    expect(cache.lookups).toEqual({ hits: 1, misses: 0 });
    expect(await fs.readdir(dir.cur.path)).toEqual([]);
  });

  it("saves recordings as <xxh64(text)>.json", async () => {
    const cache = createCache();
    const recording = createRecording("test");
    await cache.update(recording);
    await cache.save();

    expect(await fs.readdir(dir.cur.path)).toEqual([`${recording.id}.json`]);
    expect(await createCache().lookup("  test\n")).toEqual(recording);
  });

  it("keeps updates staged while saving", async () => {
    const cache = createCache();
    await cache.update(createRecording("a"));
    const saving = cache.save();
    await cache.update(createRecording("b"));
    await cache.update(createRecording("a", 2));
    await saving;

    expect(await createCache().lookup("a")).toEqual(createRecording("a"));
    expect(await createCache().lookup("b")).toBeNull();

    await cache.save();

    expect(await createCache().lookup("a", { version: 2 })).toEqual(
      createRecording("a", 2),
    );
    expect(await createCache().lookup("b")).toEqual(createRecording("b"));
  });

  it("discards staged recordings", async () => {
    const cache = createCache();
    await cache.update(createRecording("test"));
    await cache.discard();
    await cache.save();

    expect(await cache.lookup("test")).toBeNull();
    expect(await fs.readdir(dir.cur.path)).toEqual([]);
  });

  it("replaces a recording of the same test", async () => {
    const cache = createCache();
    await cache.update(createRecording("test"));
    await cache.save();
    const updated = { ...createRecording("test"), agent: "other-agent" };
    await cache.update(updated);
    await cache.save();

    expect(await createCache().lookup("test")).toEqual(updated);
  });

  it("isolates returned recordings from the cache", async () => {
    const cache = createCache();
    const recording = createRecording("test");
    await cache.update(recording);
    recording.agent = "mutated";
    const found = await cache.lookup("test");
    if (found) found.text = "mutated";

    expect(await cache.lookup("test")).toEqual(createRecording("test"));
  });

  it("misses a recording of another version", async () => {
    const cache = createCache();
    await cache.update(createRecording("test", 1));
    await cache.save();

    expect(await cache.lookup("test", { version: 2 })).toBeNull();
    expect(await cache.lookup("test")).toEqual(createRecording("test", 1));
    expect(cache.lookups).toEqual({ hits: 1, misses: 1 });
  });

  it("replaces a recording of another version on save", async () => {
    const cache = createCache();
    await cache.update(createRecording("test", 1));
    await cache.save();
    await cache.update(createRecording("test", 2));
    await cache.save();

    expect(await createCache().lookup("test", { version: 2 })).toEqual(
      createRecording("test", 2),
    );
    expect(await createCache().lookup("test")).toBeNull();
  });

  it("misses a recording that fails to parse", async () => {
    const id = Recording.textToId("test");
    await fs.writeFile(path.join(dir.cur.path, `${id}.json`), '{"id": 1}');
    const cache = createCache();

    expect(await cache.lookup("test")).toBeNull();
    expect(cache.lookups).toEqual({ hits: 0, misses: 1 });
  });
});
