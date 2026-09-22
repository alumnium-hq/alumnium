import { describe, expect, it, vi } from "vitest";
import type { BaseDriver } from "../drivers/BaseDriver.ts";
import { Keys } from "../drivers/keys.ts";
import { PressKeyTool } from "./PressKeyTool.ts";

describe(PressKeyTool, () => {
  it("initializes with valid keys and invokes driver.pressKey", async () => {
    for (const key of Keys.enum) {
      const tool = new PressKeyTool({ key });
      expect(tool.key).toBe(key);

      const driver = {
        pressKey: vi.fn(async () => undefined),
      } as unknown as BaseDriver;

      await tool.invoke(driver);
      expect(driver.pressKey).toHaveBeenCalledWith(key);
    }
  });

  it("throws an error when key is undefined or missing", () => {
    expect(() => new PressKeyTool({} as any)).toThrow(
      'Unsupported key: "undefined". Supported keys are: Backspace, Enter, Escape, Tab',
    );
  });

  it("throws an error when key is invalid or unsupported", () => {
    expect(() => new PressKeyTool({ key: "F5" as any })).toThrow(
      'Unsupported key: "F5". Supported keys are: Backspace, Enter, Escape, Tab',
    );
    expect(() => new PressKeyTool({ key: "Control+r" as any })).toThrow(
      'Unsupported key: "Control+r". Supported keys are: Backspace, Enter, Escape, Tab',
    );
  });
});
