import { describe, expect, it } from "vitest";
import { CliProtocol } from "./CliProtocol.ts";

describe("CliProtocol", () => {
  describe("Request", () => {
    it("accepts run and stop requests", () => {
      expect(
        CliProtocol.Request.safeParse({
          id: 1,
          method: "run",
          params: { tool: "do", input: { goal: "x" } },
        }).success,
      ).toBe(true);
      expect(
        CliProtocol.Request.safeParse({
          id: 2,
          method: "stop",
          params: { saveCache: true },
        }).success,
      ).toBe(true);
    });

    it("rejects unknown methods and missing params", () => {
      expect(
        CliProtocol.Request.safeParse({ id: 1, method: "kill", params: {} })
          .success,
      ).toBe(false);
      expect(
        CliProtocol.Request.safeParse({ id: 1, method: "run" }).success,
      ).toBe(false);
      expect(
        CliProtocol.Request.safeParse({ id: 1, method: "stop", params: {} })
          .success,
      ).toBe(false);
    });
  });

  describe("Response", () => {
    it("accepts results and errors", () => {
      expect(
        CliProtocol.Response.safeParse({ id: 1, result: { text: "ok" } })
          .success,
      ).toBe(true);
      expect(
        CliProtocol.Response.safeParse({ id: 1, error: "boom" }).success,
      ).toBe(true);
    });

    it("rejects responses without a result or error", () => {
      expect(CliProtocol.Response.safeParse({ id: 1 }).success).toBe(false);
    });
  });
});
