import { describe, expect, it } from "vitest";
import { Params } from "./Params.ts";

describe("Params", () => {
  it("substitutes known placeholders", () => {
    expect(Params.substitute("{a} {b} {}", { a: "1" })).toBe("1 {b} {}");
  });

  it("masks values, longest first", () => {
    expect(Params.mask("1 and 11", { a: "1", b: "11" })).toBe("{a} and {b}");
  });
});
