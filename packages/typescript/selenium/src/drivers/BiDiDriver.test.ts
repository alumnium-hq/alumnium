import type { WebDriver } from "selenium-webdriver";
import { Driver as FirefoxWebDriver } from "selenium-webdriver/firefox.js";
import { describe, expect, it, vi } from "vitest";
import { BiDiDriver } from "./BiDiDriver.ts";

describe("BiDiDriver", () => {
  it("installs the waiter before subscribing to navigation events", async () => {
    const send = vi.fn(async (_command: { method: string }) => ({
      result: {},
    }));
    const quit = vi.fn(async () => undefined);
    const webdriver = Object.assign(Object.create(FirefoxWebDriver.prototype), {
      getCapabilities: vi.fn(async () => ({ get: () => "ws://localhost" })),
      getBidi: vi.fn(async () => ({ send })),
      quit,
    }) as WebDriver;

    const driver = new BiDiDriver(webdriver);
    await driver.quit();

    const methods = send.mock.calls.map(([command]) => command.method);
    expect(methods[0]).toBe("script.addPreloadScript");
    expect(
      methods.filter((method) => method === "session.subscribe"),
    ).not.toHaveLength(0);
    expect(methods.at(-1)).toBe("script.addPreloadScript");
    expect(quit).toHaveBeenCalledOnce();
  });
});
