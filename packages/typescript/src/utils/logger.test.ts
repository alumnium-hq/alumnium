import { describe, expect, it } from "vitest";
import { moduleUrlToLoggerCategory } from "./logger.js";

describe(moduleUrlToLoggerCategory, () => {
  it("should convert module URL to logger category", () => {
    expect(
      moduleUrlToLoggerCategory(
        "file:///home/koss/code/alumnium/packages/typescript/src/bundle.ts",
      ),
    ).toBe("bundle");
    expect(
      moduleUrlToLoggerCategory(
        "file:///home/koss/code/alumnium/packages/typescript/src/server/agents/AreaAgent.ts",
      ),
    ).toBe("server/agents/AreaAgent");
  });
});
