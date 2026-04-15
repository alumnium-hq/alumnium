import path from "node:path";
import { describe, expect, it } from "vitest";
import { safePathJoin } from "./fs.ts";

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
