const { expect, test } = require("@playwright/test");
const appium = require("@alumnium/appium");
const core = require("@alumnium/core");
const coreInternal = require("@alumnium/core/internal");
const maestro = require("@alumnium/maestro");
const playwright = require("@alumnium/playwright");
const selenium = require("@alumnium/selenium");
const xcode = require("@alumnium/xcode");
const { Alumni } = require("alumnium");

const providers = Object.fromEntries(
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
  ].map((name) => [name, require(`@alumnium/${name}`)]),
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
