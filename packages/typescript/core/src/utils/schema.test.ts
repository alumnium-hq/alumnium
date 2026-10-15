import path from "node:path";
import { describe, expect, it } from "vitest";
import { filenameString, pathString } from "./schema.ts";

describe("pathString", () => {
  it("normalizes path separators", () => {
    const result = pathString().parse("foo\\bar/baz");
    expect(result).toBe(path.join("foo", "bar", "baz"));
  });

  it("rejects empty paths", () => {
    const result = pathString().safeParse("");
    expect(result.success).toBe(false);
  });
});

describe("filenameString", () => {
  it("accepts filenames", () => {
    expect(filenameString().parse("asd.log")).toBe("asd.log");
    expect(filenameString().parse("alumnium-debug.log")).toBe(
      "alumnium-debug.log",
    );
  });

  it("rejects paths", () => {
    expect(filenameString().safeParse("logs/asd.log").success).toBe(false);
    expect(filenameString().safeParse("logs\\asd.log").success).toBe(false);
  });

  it("rejects unsafe filenames", () => {
    expect(filenameString().safeParse("file:name.log").success).toBe(false);
    expect(filenameString().safeParse("CON").success).toBe(false);
  });
});
