import { describe, expect, it } from "bun:test";
import { modulePathToLoggerCategory } from "./logger.js";

describe(modulePathToLoggerCategory, () => {
  it("should convert module URL to logger category", () => {
    expect(
      modulePathToLoggerCategory(
        "/home/koss/code/alumnium/packages/core/src/cli.ts",
      ),
    ).toBe("cli");
    expect(
      modulePathToLoggerCategory(
        "/home/koss/code/alumnium/packages/core/src/server/agents/AreaAgent.ts",
      ),
    ).toBe("server/agents/AreaAgent");
    expect(
      modulePathToLoggerCategory(
        "C:\\Users\\koss\\code\\alumnium\\packages\\core\\src\\server\\agents\\AreaAgent.ts",
      ),
    ).toBe("server/agents/AreaAgent");
  });
});
