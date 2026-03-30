import { describe, expect, it } from "bun:test";
import { moduleUrlToLoggerCategory } from "./logger.js";

describe(moduleUrlToLoggerCategory, () => {
  it("should convert module URL to logger category", () => {
    expect(
      moduleUrlToLoggerCategory(
        "file:///home/koss/code/alumnium/packages/typescript/src/cli.ts",
      ),
    ).toBe("cli");
    expect(
      moduleUrlToLoggerCategory(
        "file:///home/koss/code/alumnium/packages/typescript/src/server/agents/AreaAgent.ts",
      ),
    ).toBe("server/agents/AreaAgent");
  });
});
