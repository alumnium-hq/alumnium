import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ensureDir, safePathJoin, writeFileAtomic } from "./fs.ts";

describe("ensureDir", () => {
  it("creates a missing directory recursively", async () => {
    const base = await fs.mkdtemp(
      path.join(os.tmpdir(), "alumnium-ensuredir-"),
    );
    const target = path.join(base, "nested", "dir");
    try {
      await ensureDir(target);
      const stat = await fs.stat(target);
      expect(stat.isDirectory()).toBe(true);
    } finally {
      await fs.rm(base, { recursive: true, force: true });
    }
  });

  it("is a no-op for an already-existing directory", async () => {
    const base = await fs.mkdtemp(
      path.join(os.tmpdir(), "alumnium-ensuredir-"),
    );
    try {
      await expect(ensureDir(base)).resolves.toBeUndefined();
      const stat = await fs.stat(base);
      expect(stat.isDirectory()).toBe(true);
    } finally {
      await fs.rm(base, { recursive: true, force: true });
    }
  });
});

describe("writeFileAtomic", () => {
  const withTmpDir = async (fn: (dir: string) => Promise<void>) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "alumnium-atomic-"));
    try {
      await fn(dir);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  };

  it("writes data to file", () =>
    withTmpDir(async (dir) => {
      const file = path.join(dir, "file.json");
      await writeFileAtomic(file, "content");
      expect(await fs.readFile(file, "utf-8")).toBe("content");
    }));

  it("replaces existing file", () =>
    withTmpDir(async (dir) => {
      const file = path.join(dir, "file.json");
      await fs.writeFile(file, "old");
      await writeFileAtomic(file, "new");
      expect(await fs.readFile(file, "utf-8")).toBe("new");
    }));

  it("leaves no temporary files behind", () =>
    withTmpDir(async (dir) => {
      await writeFileAtomic(path.join(dir, "file.json"), "content");
      expect(await fs.readdir(dir)).toEqual(["file.json"]);
    }));

  it("cleans up the temporary file when the write fails", () =>
    withTmpDir(async (dir) => {
      // Renaming a file over a non-empty directory fails.
      const target = path.join(dir, "target");
      await fs.mkdir(target);
      await fs.writeFile(path.join(target, "child"), "");
      await expect(writeFileAtomic(target, "content")).rejects.toThrow();
      expect(await fs.readdir(dir)).toEqual(["target"]);
    }));

  it("never exposes partially written content to concurrent readers", () =>
    withTmpDir(async (dir) => {
      const file = path.join(dir, "file.json");
      const contents = Array.from({ length: 4 }, (_, i) =>
        JSON.stringify({ i, payload: "x".repeat(1024 * 1024) }),
      );
      await writeFileAtomic(file, contents[0]!);

      let writing = true;
      const torn: number[] = [];
      const read = async () => {
        while (writing) {
          const content = await fs.readFile(file, "utf-8");
          if (!contents.includes(content)) torn.push(content.length);
        }
      };
      const readers = [read(), read()];

      // Writes of the same path that overlap each other and the readers.
      for (let round = 0; round < 25; round++)
        await Promise.all(contents.map((c) => writeFileAtomic(file, c)));
      writing = false;
      await Promise.all(readers);

      expect(torn).toEqual([]);
      expect(contents).toContain(await fs.readFile(file, "utf-8"));
      expect(await fs.readdir(dir)).toEqual(["file.json"]);
    }));
});

describe("safePathJoin", () => {
  it("sanitizes and joins path segments", () => {
    const result = safePathJoin("folder", "CON", "file:name.txt");
    expect(result).toBe(testPathJoin("folder", "CON_", "file_name.txt"));
  });

  it("converts OS-specific paths", () => {
    const result = safePathJoin("folder\\hello", "world/w00t", "file:name.txt");
    expect(result).toBe(
      testPathJoin("folder", "hello", "world", "w00t", "file_name.txt"),
    );
  });

  it("normalizes .. and . segments in absolute paths", () => {
    const result = safePathJoin("/home/user", "../../etc", "file.txt");
    expect(result).toBe(testPathJoin(`${path.sep}etc`, "file.txt"));
  });

  it("preserves root directory path", () => {
    const result = safePathJoin("/home/user", ".hidden", "file.txt");
    expect(result).toBe(
      testPathJoin(`${path.sep}home`, "user", ".hidden", "file.txt"),
    );
  });

  it("resolves empty solo segment as .", () => {
    const result = safePathJoin("");
    expect(result).toBe(".");
  });
});

function testPathJoin(...segments: string[]) {
  return segments.join(path.sep);
}
