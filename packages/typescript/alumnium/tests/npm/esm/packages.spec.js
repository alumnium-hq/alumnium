import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";
import { Alumni } from "alumnium";
import * as appium from "@alumnium/appium";
import * as core from "@alumnium/core";
import * as coreInternal from "@alumnium/core/internal";
import * as maestro from "@alumnium/maestro";
import * as playwright from "@alumnium/playwright";
import * as selenium from "@alumnium/selenium";
import * as xcode from "@alumnium/xcode";

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
  await Promise.all(
    Object.keys(BUILDERS).map(async (name) => [
      name,
      await import(`@alumnium/${name}`),
    ]),
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
  for (const [name, builders] of Object.entries(BUILDERS)) {
    for (const builder of builders) {
      const model = providers[name][builder]();
      expect(model.provider, `${name}.${builder}()`).toBeTruthy();
      expect(model.createLlm, `${name}.${builder}()`).toBeInstanceOf(Function);
    }
  }
});

// ESM and CommonJS load separate copies of the packages, so a model built in
// one must work with sessions of the other.
test("models built in ESM work in CommonJS", async ({ page }) => {
  const require = createRequire(import.meta.url);
  const { Alumni: CommonJsAlumni } = require("@alumnium/playwright");
  const al = new CommonJsAlumni(page, { model: providers.openai.openai() });
  expect(al.client.session.llm).toBeDefined();
  await al.quit();
});
