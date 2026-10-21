import { describe, expect, it } from "vitest";
import {
  contentTexts,
  eachStringLeaf,
  findMasks,
  mapTexts,
  parseInput,
  parseJsonStructure,
} from "./maskerUtils.ts";

describe("eachStringLeaf", () => {
  it("visits string leaves at any depth with their paths", () => {
    const paths: string[] = [];
    eachStringLeaf(
      { a: "1", b: [{ c: "2" }, "3", 4], d: { e: null, f: true } },
      (value, path) => {
        paths.push(`${path}=${value}`);
        return undefined;
      },
    );

    expect(paths).toEqual(["a=1", "b[0].c=2", "b[1]=3"]);
  });

  it("replaces leaves in place", () => {
    const value = { a: "x", b: ["x", { c: "x" }], d: 1 };
    eachStringLeaf(value, (leaf) => `${leaf}!`);

    expect(value).toEqual({ a: "x!", b: ["x!", { c: "x!" }], d: 1 });
  });
});

describe("findMasks", () => {
  it("finds every match in order of appearance", () => {
    expect(findMasks({ a: "<M_1> <M_2>", b: ["<M_3>"] }, /<M_\d>/g)).toEqual([
      "<M_1>",
      "<M_2>",
      "<M_3>",
    ]);
  });

  it("scans a bare string", () => {
    expect(findMasks("<M_1>", /<M_\d>/g)).toEqual(["<M_1>"]);
  });
});

describe("parseInput", () => {
  it("clones the input", () => {
    const input = { params: { a: "1" } };
    const parsed = parseInput(input);
    (parsed["params"] as Record<string, string>)["a"] = "2";

    expect(input).toEqual({ params: { a: "1" } });
  });

  it("rejects an input that is not an object", () => {
    expect(() => parseInput("ls")).toThrow(TypeError);
    expect(() => parseInput(null)).toThrow(TypeError);
  });
});

describe("parseJsonStructure", () => {
  it("parses an object or an array", () => {
    expect(parseJsonStructure('{"a": 1}')).toEqual({ a: 1 });
    expect(parseJsonStructure("[1]")).toEqual([1]);
  });

  it("rejects a bare scalar or non-JSON", () => {
    expect(parseJsonStructure("7")).toBeNull();
    expect(parseJsonStructure("null")).toBeNull();
    expect(parseJsonStructure("4\n8")).toBeNull();
  });
});

describe("contentTexts", () => {
  it("reads a string or text blocks", () => {
    expect(contentTexts("a")).toEqual(["a"]);
    expect(
      contentTexts([
        { type: "text", text: "a" },
        { type: "image", data: "..." },
        { type: "text", text: "b" },
      ]),
    ).toEqual(["a", "b"]);
  });
});

describe("mapTexts", () => {
  it("maps a string or text blocks, keeping other blocks", () => {
    const upper = (text: string) => text.toUpperCase();

    expect(mapTexts("a", upper)).toBe("A");
    expect(
      mapTexts(
        [
          { type: "text", text: "a" },
          { type: "image", data: "..." },
        ],
        upper,
      ),
    ).toEqual([
      { type: "text", text: "A" },
      { type: "image", data: "..." },
    ]);
  });
});
