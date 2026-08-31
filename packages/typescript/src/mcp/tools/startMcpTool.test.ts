import { describe, expect, it, vi } from "vitest";
import { createAppiumDriver, createChromeDriver } from "../mcpDrivers.ts";
import { startMcpTool } from "./startMcpTool.ts";

// A malformed allowlistDomains/denylistDomains pattern must be rejected before any browser or
// Appium process is spawned — mocking these to throw proves they were never reached.
vi.mock("../mcpDrivers.ts", () => ({
  createChromeDriver: vi.fn(() => {
    throw new Error("createChromeDriver should not have been called");
  }),
  createAppiumDriver: vi.fn(() => {
    throw new Error("createAppiumDriver should not have been called");
  }),
}));

describe("startMcpTool", () => {
  it("rejects and never launches a browser when allowlistDomains has an invalid regex", async () => {
    await expect(
      startMcpTool.execute({
        capabilities: JSON.stringify({
          platformName: "chrome",
          "alumnium:options": { allowlistDomains: ["(unterminated"] },
        }),
      }),
    ).rejects.toThrow(/Invalid domain policy configuration/);

    expect(createChromeDriver).not.toHaveBeenCalled();
    expect(createAppiumDriver).not.toHaveBeenCalled();
  });

  it("rejects when denylistDomains has an invalid regex, even with a valid allowlist", async () => {
    await expect(
      startMcpTool.execute({
        capabilities: JSON.stringify({
          platformName: "chrome",
          "alumnium:options": {
            allowlistDomains: ["(^|\\.)example\\.com$"],
            denylistDomains: ["(unterminated"],
          },
        }),
      }),
    ).rejects.toThrow(/Invalid domain policy configuration/);

    expect(createChromeDriver).not.toHaveBeenCalled();
  });

  it("does not validate a policy when allowlistDomains is omitted", async () => {
    // No allowlistDomains -> feature off -> NavigationPolicy.create() returns undefined and
    // never throws, so execution proceeds to (mocked) driver creation, which then throws.
    await expect(
      startMcpTool.execute({
        capabilities: JSON.stringify({ platformName: "chrome" }),
      }),
    ).rejects.toThrow("createChromeDriver should not have been called");
  });
});
