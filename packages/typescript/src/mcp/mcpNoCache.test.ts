import { describe, expect, it } from "vitest";
import {
  MCP_NO_CACHE_META_KEY,
  mcpNoCacheMeta,
  parseMcpNoCache,
} from "./mcpNoCache.ts";

describe(mcpNoCacheMeta, () => {
  it("builds meta the parser reads back", () => {
    expect(parseMcpNoCache(mcpNoCacheMeta())).toBe(true);
  });

  // NOTE: The wire contract between the runner and the MCP server, so it is
  // pinned rather than left to whatever the constant happens to say.
  it("uses a DNS-prefixed key, as MCP requires of a non-spec one", () => {
    expect(MCP_NO_CACHE_META_KEY).toBe("alumnium.ai/no-cache");
  });
});

describe(parseMcpNoCache, () => {
  it("reads an explicit flag", () => {
    expect(parseMcpNoCache({ "alumnium.ai/no-cache": true })).toBe(true);
  });

  // NOTE: Everything below leaves the cache on. That is what a caller knowing
  // nothing about the key means, and it is what makes a new server safe to call
  // from an old client.
  it("leaves the cache on without meta", () => {
    expect(parseMcpNoCache(undefined)).toBe(false);
    expect(parseMcpNoCache(null)).toBe(false);
  });

  it("leaves the cache on when the key is absent", () => {
    expect(parseMcpNoCache({})).toBe(false);
    expect(parseMcpNoCache({ "alumnium.ai/cache-lookups": { hits: 1 } })).toBe(
      false,
    );
  });

  it("leaves the cache on for a value that isn't a boolean true", () => {
    expect(parseMcpNoCache({ "alumnium.ai/no-cache": "true" })).toBe(false);
    expect(parseMcpNoCache({ "alumnium.ai/no-cache": 1 })).toBe(false);
    expect(parseMcpNoCache({ "alumnium.ai/no-cache": false })).toBe(false);
  });

  it("leaves the cache on for meta that isn't an object", () => {
    expect(parseMcpNoCache("yes")).toBe(false);
  });
});
