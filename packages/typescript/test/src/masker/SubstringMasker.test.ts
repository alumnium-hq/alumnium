import { describe, expect, it } from "vitest";
import { SubstringMasker } from "./SubstringMasker.ts";

class TestMasker extends SubstringMasker {
  constructor(values: Record<string, string>) {
    super(/<TEST_\w+(?::json)?>/g);
    for (const [name, value] of Object.entries(values))
      this.register(`<TEST_${name}>`, value);
  }
}

describe("SubstringMasker", () => {
  describe("mask", () => {
    it("masks a value wherever it occurs", () => {
      const masker = new TestMasker({ PW: "p4ssw0rd" });

      expect(masker.mask("p4ssw0rd and p4ssw0rd!")).toBe(
        "<TEST_PW> and <TEST_PW>!",
      );
    });

    it("masks every string leaf in place", () => {
      const masker = new TestMasker({ PW: "p4ssw0rd" });
      const value = { a: ["pw=p4ssw0rd", 7], b: { c: "p4ssw0rd" }, d: true };

      expect(masker.mask(value)).toBe(value);
      expect(value).toEqual({
        a: ["pw=<TEST_PW>", 7],
        b: { c: "<TEST_PW>" },
        d: true,
      });
    });

    it("masks a longer value before a shorter one it contains", () => {
      const masker = new TestMasker({
        HOST: "example.com",
        URL: "https://example.com",
      });

      expect(masker.mask("open https://example.com or example.com")).toBe(
        "open <TEST_URL> or <TEST_HOST>",
      );
    });

    it("masks a value JSON-escaped in a string", () => {
      const masker = new TestMasker({ TOKEN: 'a"b' });

      expect(masker.mask('{"token": "a\\"b"}')).toBe(
        '{"token": "<TEST_TOKEN:json>"}',
      );
    });

    it("restores a JSON-escaped value escaped", () => {
      const masker = new TestMasker({ TOKEN: 'a"b' });
      const json = JSON.stringify({ token: 'a"b', raw: 'a"b' });

      const masked = masker.mask({ content: json, text: 'say a"b' });
      expect(masker.unmask(masked)).toEqual({ content: json, text: 'say a"b' });
    });

    it("takes `$` patterns in a value literally", () => {
      const masker = new TestMasker({ PW: "$&pw" });

      expect(masker.mask("pw=$&pw")).toBe("pw=<TEST_PW>");
    });

    it("keeps the first mask of a value registered twice", () => {
      const masker = new TestMasker({ A: "x", B: "x" });

      expect(masker.mask("x")).toBe("<TEST_A>");
    });

    it("leaves a value alone with nothing registered", () => {
      const masker = new TestMasker({});

      expect(masker.size).toBe(0);
      expect(masker.mask("text")).toBe("text");
    });
  });

  describe("unmask", () => {
    it("substitutes values for their masks in place", () => {
      const masker = new TestMasker({ PW: "$&pw", URL: "https://a.com" });
      const value = { goal: "open <TEST_URL>/login", params: ["<TEST_PW>"] };

      expect(masker.unmask(value)).toBe(value);
      expect(value).toEqual({
        goal: "open https://a.com/login",
        params: ["$&pw"],
      });
    });

    it("leaves a mask it has no value for in place", () => {
      const masker = new TestMasker({ PW: "x" });

      expect(masker.unmask({ goal: "<TEST_OTHER>" })).toEqual({
        goal: "<TEST_OTHER>",
      });
    });
  });

  describe("findLeaks", () => {
    it("finds values that survived masking, by mask", () => {
      const masker = new TestMasker({ PW: "p4ssw0rd", OTHER: "nope" });

      expect(masker.findLeaks({ steps: [{ text: "pw p4ssw0rd" }] })).toEqual([
        "<TEST_PW>",
      ]);
    });

    it("finds a leak in a bare string", () => {
      expect(new TestMasker({ PW: "p4ssw0rd" }).findLeaks("p4ssw0rd")).toEqual([
        "<TEST_PW>",
      ]);
    });

    it("finds a value JSON-escaped in a string", () => {
      const masker = new TestMasker({ TOKEN: 'a"b' });

      expect(masker.findLeaks('{"token": "a\\"b"}')).toEqual(["<TEST_TOKEN>"]);
    });

    it("finds nothing in masked values", () => {
      const masker = new TestMasker({ PW: "p4ssw0rd" });

      expect(masker.findLeaks(masker.mask({ text: "p4ssw0rd" }))).toEqual([]);
    });
  });
});
