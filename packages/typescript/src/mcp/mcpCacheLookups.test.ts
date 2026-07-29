import { describe, expect, it } from "vitest";
import {
  parseMcpCacheLookups,
  parseMcpCacheLookupsOutput,
} from "./mcpCacheLookups.ts";

describe(parseMcpCacheLookups, () => {
  it("parses counters", () => {
    expect(parseMcpCacheLookups({ hits: 2, misses: 1 })).toEqual({
      hits: 2,
      misses: 1,
    });
  });

  it("ignores a missing value", () => {
    expect(parseMcpCacheLookups(undefined)).toBeUndefined();
  });

  it("ignores incomplete counters", () => {
    expect(parseMcpCacheLookups({ hits: 2 })).toBeUndefined();
  });

  it("ignores counters of a wrong type", () => {
    expect(parseMcpCacheLookups({ hits: "2", misses: "1" })).toBeUndefined();
  });

  it("ignores a non-object value", () => {
    expect(parseMcpCacheLookups("yes")).toBeUndefined();
  });
});

describe(parseMcpCacheLookupsOutput, () => {
  it("parses counters reported by the stop tool", () => {
    const text = JSON.stringify({
      id: "test-driver",
      token_usage: { total: {}, cached: {} },
      cache_lookups: { hits: 9, misses: 1 },
    });

    expect(parseMcpCacheLookupsOutput(text)).toEqual({ hits: 9, misses: 1 });
  });

  it("ignores an output without counters", () => {
    expect(parseMcpCacheLookupsOutput(JSON.stringify({ result: 4 }))).toBe(
      undefined,
    );
  });

  it("ignores a non-JSON output", () => {
    expect(parseMcpCacheLookupsOutput("4")).toBeUndefined();
    expect(parseMcpCacheLookupsOutput("the result is 4")).toBeUndefined();
  });
});
