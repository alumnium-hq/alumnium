import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  durationString,
  filenameString,
  pathString,
  sizeString,
} from "./schema.ts";

describe("sizeString", () => {
  it("parses sizes in binary units", () => {
    expect(sizeString().parse("512")).toBe(512);
    expect(sizeString().parse("2KB")).toBe(2048);
    expect(sizeString().parse("1.5 mb")).toBe(1.5 * 1024 ** 2);
    expect(sizeString().parse("1GB")).toBe(1024 ** 3);
    expect(sizeString().parse("0")).toBe(0);
  });

  it("encodes sizes in the largest exact unit", () => {
    expect(z.encode(sizeString(), 1024 ** 3)).toBe("1GB");
    expect(z.encode(sizeString(), 1536)).toBe("1536B");
    expect(z.encode(sizeString(), 0)).toBe("0B");
  });

  it("rejects invalid sizes", () => {
    expect(sizeString().safeParse("1 GiB").success).toBe(false);
    expect(sizeString().safeParse("-1GB").success).toBe(false);
    expect(sizeString().safeParse("big").success).toBe(false);
  });
});

describe("durationString", () => {
  it("parses durations", () => {
    expect(durationString().parse("500ms")).toBe(500);
    expect(durationString().parse("90s")).toBe(90_000);
    expect(durationString().parse("12h")).toBe(12 * 60 * 60 * 1000);
    expect(durationString().parse("30d")).toBe(30 * 24 * 60 * 60 * 1000);
    expect(durationString().parse("2w")).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it("encodes durations in the largest exact unit", () => {
    expect(z.encode(durationString(), 30 * 24 * 60 * 60 * 1000)).toBe("30d");
    expect(z.encode(durationString(), 90_000)).toBe("90s");
  });

  it("rejects invalid durations", () => {
    expect(durationString().safeParse("30").success).toBe(false);
    expect(durationString().safeParse("1y").success).toBe(false);
  });
});

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
