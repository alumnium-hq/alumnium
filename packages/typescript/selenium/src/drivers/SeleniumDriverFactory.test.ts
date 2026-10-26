import type { WebDriver } from "selenium-webdriver";
import { Driver as FirefoxWebDriver } from "selenium-webdriver/firefox.js";
import { describe, expect, it, vi } from "vitest";
import { BiDiDriver } from "./BiDiDriver.ts";
import { CdpDriver } from "./CdpDriver.ts";
import { SeleniumDriverFactory } from "./SeleniumDriverFactory.ts";

describe("SeleniumDriverFactory", () => {
  it("creates the CDP driver for Chromium browsers", () => {
    const driver = SeleniumDriverFactory.create({
      getCapabilities: vi.fn(async () => ({ get: () => undefined })),
      sendAndGetDevToolsCommand: vi.fn(async () => undefined),
    } as unknown as WebDriver);

    expect(driver).toBeInstanceOf(CdpDriver);
    expect(driver.platform).toBe("chromium");
  });

  it("creates the BiDi driver for Firefox", () => {
    const driver = SeleniumDriverFactory.create(
      Object.assign(Object.create(FirefoxWebDriver.prototype), {
        getCapabilities: vi.fn(async () => ({ get: () => undefined })),
      }) as WebDriver,
    );

    expect(driver).toBeInstanceOf(BiDiDriver);
    expect(driver.platform).toBe("firefox");
  });
});
