import { describe, expect, it } from "vitest";
import { Instrumentation } from "./Instrumentation.ts";

describe("Instrumentation", () => {
  describe("moduleUrlToName", () => {
    it("should convert module URL to telemetry name", () => {
      expect(
        Instrumentation.moduleUrlToName(
          "file:///home/koss/code/alumnium/packages/typescript/src/bundle.ts",
        ),
      ).toBe("bundle");
      expect(
        Instrumentation.moduleUrlToName(
          "file:///home/koss/code/alumnium/packages/typescript/src/server/agents/AreaAgent.ts",
        ),
      ).toBe("server.agents.area_agent");
    });
  });
});
