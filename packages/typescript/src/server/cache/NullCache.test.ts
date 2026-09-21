import { describe, expect, it } from "vitest";
import { AppId } from "../../AppId.ts";
import { LlmContext } from "../LlmContext.ts";
import { SessionContext } from "../session/SessionContext.ts";
import { SessionId } from "../session/SessionId.ts";
import { NullCache } from "./NullCache.ts";

describe(NullCache, () => {
  describe("lookup", () => {
    it("never returns an entry", async () => {
      const cache = new NullCache(createSessionContext());

      const result = await cache.lookup(...lookupArgs());

      expect(result).toBeNull();
    });

    it("counts every lookup as a miss", async () => {
      const cache = new NullCache(createSessionContext());

      await cache.lookup(...lookupArgs());
      await cache.lookup(...lookupArgs());

      expect(cache.lookups).toEqual({ hits: 0, misses: 2 });
    });
  });
});

function createSessionContext() {
  return new SessionContext({
    app: "test-app" as AppId,
    sessionId: "test-session-id" as SessionId,
  });
}

function lookupArgs() {
  return ["prompt" as LlmContext.Prompt, "llm" as LlmContext.LlmKey] as const;
}
