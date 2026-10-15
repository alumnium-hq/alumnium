import { expect, test } from "@playwright/test";
import { Alumni } from "alumnium";
import * as appium from "@alumnium/appium";
import * as core from "@alumnium/core";
import * as coreInternal from "@alumnium/core/internal";
import * as maestro from "@alumnium/maestro";
import * as playwright from "@alumnium/playwright";
import * as selenium from "@alumnium/selenium";
import * as xcode from "@alumnium/xcode";

const providers = Object.fromEntries(
  await Promise.all(
    [
      "anthropic",
      "aws",
      "azure",
      "codex",
      "cursor",
      "deepseek",
      "google",
      "mistral",
      "ollama",
      "openai",
      "openrouter",
      "xai",
    ].map(async (name) => [name, await import(`@alumnium/${name}`)]),
  ),
);

test("all packages import", () => {
  expect(Alumni).toBeInstanceOf(Function);
  expect(core.Alumni).toBeInstanceOf(Function);
  expect(core.Area).toBeInstanceOf(Function);
  // The public entry shares module instances with the internal one.
  expect(core.Alumni).toBe(coreInternal.Alumni);
  expect(coreInternal.ALUMNIUM_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  expect(coreInternal.Logger.get).toBeInstanceOf(Function);
  for (const driver of [playwright, selenium, appium, maestro, xcode]) {
    expect(driver.Alumni.prototype).toBeInstanceOf(core.Alumni);
  }
  for (const [name, pkg] of Object.entries(providers)) {
    const map = Object.entries(pkg).find(([key]) => key.endsWith("Providers"));
    expect(map, `${name} providers map`).toBeDefined();
  }
});
