import { describe, expect, it } from "bun:test";
import { pythonicSplitlines } from "./pythonicSplitlines.js";

describe(pythonicSplitlines, () => {
  it("splits on \\n", () => {
    expect(pythonicSplitlines("a\nb\nc")).toEqual(["a", "b", "c"]);
  });

  it("splits on \\r", () => {
    expect(pythonicSplitlines("a\rb\rc")).toEqual(["a", "b", "c"]);
  });

  it("splits on \\r\\n", () => {
    expect(pythonicSplitlines("a\r\nb\r\nc")).toEqual(["a", "b", "c"]);
  });

  it("handles mixed line endings", () => {
    expect(pythonicSplitlines("a\nb\r\nc\rd")).toEqual(["a", "b", "c", "d"]);
  });

  it("keeps line endings when keepends=true", () => {
    expect(pythonicSplitlines("a\nb\r\nc\r", true)).toEqual([
      "a\n",
      "b\r\n",
      "c\r",
    ]);
  });

  it("drops line endings when keepends=false", () => {
    expect(pythonicSplitlines("a\nb\r\nc\r", false)).toEqual(["a", "b", "c"]);
  });

  it("handles trailing newline", () => {
    expect(pythonicSplitlines("a\n")).toEqual(["a"]);
    expect(pythonicSplitlines("a\n", true)).toEqual(["a\n"]);
    expect(pythonicSplitlines("a\n\n", true)).toEqual(["a\n", "\n"]);
  });

  it("handles single newline", () => {
    expect(pythonicSplitlines("\n")).toEqual([""]);
    expect(pythonicSplitlines("\n", true)).toEqual(["\n"]);
  });

  it("handles empty string", () => {
    expect(pythonicSplitlines("")).toEqual([]);
    expect(pythonicSplitlines("", true)).toEqual([]);
  });

  it("handles string with no line breaks", () => {
    expect(pythonicSplitlines("abc")).toEqual(["abc"]);
    expect(pythonicSplitlines("abc", true)).toEqual(["abc"]);
  });

  it("handles empty lines", () => {
    expect(pythonicSplitlines("\n\n", true)).toEqual(["\n", "\n"]);
  });

  it("matches Python behavior for consecutive breaks", () => {
    expect(pythonicSplitlines("a\n\nb")).toEqual(["a", "", "b"]);
    expect(pythonicSplitlines("a\n\nb", true)).toEqual(["a\n", "\n", "b"]);
  });

  it("handles mixed newline sequences correctly", () => {
    expect(pythonicSplitlines("a\r\nb\nc\r", true)).toEqual([
      "a\r\n",
      "b\n",
      "c\r",
    ]);
  });
});
