import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ensureDir, safePathJoin } from "./fs.ts";

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
