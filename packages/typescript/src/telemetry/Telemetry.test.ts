import { describe, expect, it } from "vitest";
import { Telemetry } from "../telemetry/Telemetry.ts";

describe("Telemetry", () => {
  describe("moduleUrlToName", () => {
    it("should convert module URL to telemetry name", () => {
      expect(
        Telemetry.moduleUrlToName(
          "file:///home/koss/code/alumnium/packages/typescript/src/bundle.ts",
        ),
      ).toBe("bundle");
      expect(
        Telemetry.moduleUrlToName(
          "file:///home/koss/code/alumnium/packages/typescript/src/server/agents/AreaAgent.ts",
        ),
      ).toBe("server.agents.area_agent");
    });
  });
});
