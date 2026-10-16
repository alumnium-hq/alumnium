const { expect, test } = require("@playwright/test");
const appium = require("@alumnium/appium");
const core = require("@alumnium/core");
const coreInternal = require("@alumnium/core/internal");
const maestro = require("@alumnium/maestro");
const playwright = require("@alumnium/playwright");
const selenium = require("@alumnium/selenium");
const xcode = require("@alumnium/xcode");
const { Alumni } = require("alumnium");

// Model builders each LLM provider package exports.
const BUILDERS = {
  anthropic: ["anthropic"],
  aws: ["awsAnthropic", "awsMeta"],
  azure: ["azureFoundry", "azureOpenai"],
  codex: ["codex"],
  cursor: ["cursor"],
  deepseek: ["deepseek"],
  google: ["google"],
  mistral: ["mistral"],
  ollama: ["ollama"],
  openai: ["openai"],
  openrouter: ["openrouter"],
  xai: ["xai"],
};

const providers = Object.fromEntries(
  Object.keys(BUILDERS).map((name) => [name, require(`@alumnium/${name}`)]),
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
  for (const [name, builders] of Object.entries(BUILDERS)) {
    for (const builder of builders) {
      const model = providers[name][builder]();
      expect(model.provider, `${name}.${builder}()`).toBeTruthy();
      expect(model.createLlm, `${name}.${builder}()`).toBeInstanceOf(Function);
    }
  }
});
