import { describe, expect, it } from "vitest";
import { ParamsError } from "./client/errors/ParamsError.ts";
import { Params } from "./Params.ts";

describe(Params, () => {
  describe("substitute", () => {
    it("replaces a placeholder with its value", () => {
      expect(
        Params.from({ city: "Paris" }).substitute("type {city} to where field"),
      ).toBe("type Paris to where field");
    });

    it("stringifies non-string values", () => {
      expect(
        Params.from({ amount: 42, enabled: true }).substitute(
          "{amount}/{enabled}",
        ),
      ).toBe("42/true");
    });

    it("unescapes doubled braces", () => {
      expect(
        Params.from({ city: "Paris" }).substitute("{{literal}} {city}"),
      ).toBe("{literal} Paris");
    });

    it("does not rescan a substituted value containing braces", () => {
      expect(Params.from({ outer: "{inner}" }).substitute("{outer}")).toBe(
        "{inner}",
      );
    });

    it("leaves an unknown placeholder as-is", () => {
      expect(Params.from({ known: "x" }).substitute("{unknown}")).toBe(
        "{unknown}",
      );
    });

    it("is a no-op without values", () => {
      expect(Params.from(undefined).substitute("type {city}")).toBe(
        "type {city}",
      );
    });
  });

  describe("mask", () => {
    it("replaces a value with its placeholder", () => {
      expect(Params.from({ city: "Paris" }).mask("type Paris to where")).toBe(
        "type {city} to where",
      );
    });

    it("masks longer values first", () => {
      // NOTE: Masking `8` first would corrupt `88` into `{a}{a}`.
      expect(Params.from({ a: "8", b: "88" }).mask("88 then 8")).toBe(
        "{b} then {a}",
      );
    });

    it("only masks whole words", () => {
      expect(Params.from({ n: "1" }).mask("11 and 1 and 1.5")).toBe(
        "11 and {n} and 1.5",
      );
    });

    it("is a no-op without values", () => {
      expect(Params.from(undefined).mask("type Paris")).toBe("type Paris");
    });
  });

  describe("round trip", () => {
    it("recovers a different value from a masked element", () => {
      // NOTE: This is the elements cache path: an element is recorded with the
      // value that identified it, stored masked, then re-resolved for the next
      // value. See `ActorAgentElementsCache.update` and `ElementsCache.lookup`.
      const recorded = { role: "button", index: 0, text: "8" };

      const masked = Params.from({ number: "8" }).maskRecord(recorded);
      expect(masked).toEqual({ role: "button", index: 0, text: "{number}" });

      const resolved = Params.from({ number: "3" }).substituteRecord(masked);
      expect(resolved).toEqual({ role: "button", index: 0, text: "3" });
    });

    it("leaves non-string attributes alone", () => {
      const params = Params.from({ number: "8" });

      expect(params.maskRecord({ index: 8, text: "8" })).toEqual({
        index: 8,
        text: "{number}",
      });
    });
  });

  describe("validateGoal", () => {
    it("accepts a goal whose placeholders all have values", () => {
      expect(() =>
        Params.from({ user: "alice", password: "hunter2" }).validateGoal(
          "type {user} and {password}",
        ),
      ).not.toThrow();
    });

    it("rejects a placeholder without a value", () => {
      expect(() =>
        Params.from({ user: "alice" }).validateGoal("type {user} {password}"),
      ).toThrow(ParamsError);
    });

    it("rejects a value not referenced by the goal", () => {
      expect(() =>
        Params.from({ user: "alice", password: "x" }).validateGoal(
          "type {user}",
        ),
      ).toThrow(/not referenced by the goal: \{password\}/);
    });

    it("rejects an empty placeholder", () => {
      expect(() =>
        Params.from({ user: "alice" }).validateGoal("type {} into {user}"),
      ).toThrow(/empty placeholder/);
    });

    it("ignores braces without values", () => {
      expect(() =>
        Params.from(undefined).validateGoal("type {unmatched} and {}"),
      ).not.toThrow();
    });

    it("ignores escaped braces", () => {
      expect(() =>
        Params.from({ user: "alice" }).validateGoal("{{literal}} and {user}"),
      ).not.toThrow();
    });
  });
});
