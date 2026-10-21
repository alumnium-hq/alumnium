import { describe, expect, it } from "vitest";
import { ResponsePaths } from "./ResponsePaths.ts";

describe("ResponsePaths", () => {
  const paths = new ResponsePaths({
    "test-data/createUser": ["user.token", "sessions.*.token", "auth"],
    "test-data/createOrder": [],
    "alumnium/*": [],
    "alumnium/start": ["id"],
  });

  describe("of", () => {
    it("returns the split patterns of a tool", () => {
      expect(paths.of("alumnium/start")).toEqual([["id"]]);
      expect(paths.of("test-data/createOrder")).toEqual([]);
    });

    it("falls back to the patterns of the tool's server", () => {
      expect(paths.of("alumnium/wait")).toEqual([]);
    });

    it("returns nothing for a tool with none configured", () => {
      expect(paths.of("test-data/other")).toBeUndefined();
      expect(paths.of("Bash")).toBeUndefined();
      expect(paths.of(undefined)).toBeUndefined();
    });
  });

  describe("has", () => {
    it("tells tools with paths apart", () => {
      expect(paths.has("test-data/createUser")).toBe(true);
      expect(paths.has("test-data/createOrder")).toBe(false);
      expect(paths.has("alumnium/wait")).toBe(false);
      expect(paths.has("Bash")).toBe(false);
    });
  });

  describe("covers", () => {
    it("matches a configured path", () => {
      expect(paths.covers("test-data/createUser", ["user", "token"])).toBe(
        true,
      );
      expect(paths.covers("test-data/createUser", ["user", "id"])).toBe(false);
    });

    it("matches any key or index with a wildcard", () => {
      expect(
        paths.covers("test-data/createUser", ["sessions", "3", "token"]),
      ).toBe(true);
      expect(
        paths.covers("test-data/createUser", ["sessions", "3", "id"]),
      ).toBe(false);
    });

    it("covers every leaf nested under a path", () => {
      expect(
        paths.covers("test-data/createUser", ["auth", "tokens", "0"]),
      ).toBe(true);
    });

    it("does not match a path shorter than the pattern", () => {
      expect(paths.covers("test-data/createUser", ["user"])).toBe(false);
    });

    it("matches any number of segments with a deep wildcard", () => {
      const deep = new ResponsePaths({ tool: ["**.token", "a.**.id"] });

      expect(deep.covers("tool", ["token"])).toBe(true);
      expect(deep.covers("tool", ["user", "token"])).toBe(true);
      expect(
        deep.covers("tool", ["payment", "instrument", "summary", "token"]),
      ).toBe(true);
      expect(deep.covers("tool", ["a", "id"])).toBe(true);
      expect(deep.covers("tool", ["a", "b", "0", "id"])).toBe(true);
      expect(deep.covers("tool", ["user", "id"])).toBe(false);
      expect(deep.covers("tool", ["b", "id"])).toBe(false);
    });

    it("covers leaves nested under a deep match", () => {
      const deep = new ResponsePaths({ tool: ["**.auth"] });

      expect(deep.covers("tool", ["user", "auth", "tokens", "0"])).toBe(true);
    });

    it("covers everything with a lone deep wildcard", () => {
      expect(new ResponsePaths({ tool: ["**"] }).covers("tool", ["a"])).toBe(
        true,
      );
    });

    it("covers nothing of a tool without paths", () => {
      expect(paths.covers("Bash", ["user", "token"])).toBe(false);
      expect(paths.covers("alumnium/wait", ["waited_seconds"])).toBe(false);
    });
  });
});
