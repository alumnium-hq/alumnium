import { describe, expect, it } from "vitest";
import { looselyTypecast } from "./typecasting.ts";

describe("looselyTypecast", () => {
  it.each([
    ["0", 0],
    ["42", 42],
    ["9007199254740991", Number.MAX_SAFE_INTEGER],
  ])("converts safe integer %s to a number", (input, expected) => {
    expect(looselyTypecast(input)).toBe(expected);
  });

  it.each([
    "9007199254740992",
    "9007199254740993",
    "1234567890123456789",
    "18446744073709551615",
  ])("preserves unsafe integer %s as a string", (input) => {
    const result = looselyTypecast(input);

    expect(result).toBe(input);
    expect(JSON.parse(JSON.stringify(result))).toBe(input);
  });

  it("trims whitespace without rounding an unsafe integer", () => {
    expect(looselyTypecast("  1234567890123456789\n")).toBe(
      "1234567890123456789",
    );
  });

  it("preserves unsafe integers in lists alongside other retrieved values", () => {
    expect(
      looselyTypecast(["1234567890123456789", "42", "3.5", "true", "text"]),
    ).toEqual(["1234567890123456789", 42, 3.5, true, "text"]);
  });

  it.each([
    ["3.5", 3.5],
    ["true", true],
    ["FALSE", false],
    ["NOOP", null],
    ['"text"', "text"],
  ])("keeps existing conversion for %s", (input, expected) => {
    expect(looselyTypecast(input)).toBe(expected);
  });
});
