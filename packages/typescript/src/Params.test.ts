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

  describe("validate", () => {
    it("accepts a goal whose placeholders all have values", () => {
      expect(() =>
        Params.from({ user: "alice", password: "hunter2" }).validate(
          "type {user} and {password}",
        ),
      ).not.toThrow();
    });

    it("rejects a placeholder without a value", () => {
      expect(() =>
        Params.from({ user: "alice" }).validate("type {user} {password}"),
      ).toThrow(ParamsError);
    });

    it("rejects a value not referenced by the goal", () => {
      expect(() =>
        Params.from({ user: "alice", password: "x" }).validate("type {user}"),
      ).toThrow(/not referenced by the goal: \{password\}/);
    });

    it("rejects an empty placeholder", () => {
      expect(() =>
        Params.from({ user: "alice" }).validate("type {} into {user}"),
      ).toThrow(/empty placeholder/);
    });

    it("ignores braces without values", () => {
      expect(() =>
        Params.from(undefined).validate("type {unmatched} and {}"),
      ).not.toThrow();
    });

    it("ignores escaped braces", () => {
      expect(() =>
        Params.from({ user: "alice" }).validate("{{literal}} and {user}"),
      ).not.toThrow();
    });

    it("names the subject in the message", () => {
      expect(() =>
        Params.from({ user: "alice" }).validate(
          "the page is ready",
          "statement",
        ),
      ).toThrow(/not referenced by the statement: \{user\}/);
    });
  });

  // NOTE: `structured` mode exists for text whose braces are its own - a path,
  // or inline JSON capabilities. The cases below are the ones that made it
  // necessary: under `prose` each of them either throws or silently corrupts.
  describe("structured mode", () => {
    const CAPABILITIES = JSON.stringify({
      platformName: "chrome",
      "alumnium:options": {
        proxy: { server: "http://proxy:3128" },
        cookies: [{ name: "session", value: "abc" }],
        baseUrl: "https://{env}.example.com",
      },
    });

    it("substitutes a placeholder in a path", () => {
      expect(
        Params.from({ session_id: "eca3fa90" }).substitute(
          "/runs/{session_id}/artifacts/capabilities.json",
          "structured",
        ),
      ).toBe("/runs/eca3fa90/artifacts/capabilities.json");
    });

    it("keeps nested JSON parseable", () => {
      const substituted = Params.from({ env: "staging" }).substitute(
        CAPABILITIES,
        "structured",
      );

      expect(() => JSON.parse(substituted)).not.toThrow();
      expect(JSON.parse(substituted)["alumnium:options"].baseUrl).toBe(
        "https://staging.example.com",
      );
    });

    it("collapses a nested object's closing braces in prose mode", () => {
      // NOTE: The reason `structured` mode exists. `}}` reads as an escaped
      // brace, so the JSON comes back one brace short.
      expect(() =>
        JSON.parse(Params.from({ env: "staging" }).substitute(CAPABILITIES)),
      ).toThrow();
    });

    it("does not read a quoted JSON key as a placeholder", () => {
      expect(() =>
        Params.from({ env: "staging" }).validate(
          CAPABILITIES,
          "capabilities",
          "structured",
        ),
      ).not.toThrow();
    });

    it("does not read an empty object as an empty placeholder", () => {
      expect(() =>
        Params.from({ env: "staging" }).validate(
          '{"alumnium:options": {}, "baseUrl": "https://{env}.example.com"}',
          "capabilities",
          "structured",
        ),
      ).not.toThrow();
    });

    it("still rejects a value nothing references", () => {
      expect(() =>
        Params.from({ missing: "x" }).validate(
          '{"platformName": "chrome"}',
          "capabilities",
          "structured",
        ),
      ).toThrow(/not referenced by the capabilities: \{missing\}/);
    });
  });
});
