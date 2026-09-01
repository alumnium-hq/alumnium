import { describe, expect, it, vi } from "vitest";
import {
  NavigationBlockedError,
  NavigationPolicy,
} from "../../NavigationPolicy.ts";
import { McpState } from "../McpState.ts";
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

  it("excludes alumnium:options.navigationPolicy from the driverSettings passthrough", async () => {
    // A minimal fake WebdriverIO Browser (recognized by Alumni's constructor via truthy
    // `.capabilities`/`.getPageSource`) — avoids the real Playwright/Selenium construction path,
    // which needs a live browser context.
    const fakeBrowser = {
      capabilities: { platformName: "android" },
      getPageSource: () => {},
    } as any;
    vi.mocked(createChromeDriver).mockImplementationOnce(
      () => fakeBrowser as any,
    );

    try {
      const result = await startMcpTool.execute({
        capabilities: JSON.stringify({
          platformName: "chrome",
          "alumnium:options": {
            // If this reached the generic driverSettings passthrough, it would overwrite the
            // real policy with this no-op stand-in, silently neutralizing SSRF protection.
            navigationPolicy: { check: () => {} },
          },
        }),
      });

      const { id } = JSON.parse((result[0] as { text: string }).text);
      const al = McpState.getDriverAlumni(id);

      expect(al.driver.navigationPolicy).toBeInstanceOf(NavigationPolicy);
      expect(() =>
        al.driver.navigationPolicy.check("http://169.254.169.254/"),
      ).toThrow(NavigationBlockedError);
    } finally {
      McpState.clear();
    }
  });
});
