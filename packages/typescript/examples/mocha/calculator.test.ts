import assert from "assert";
import { Model, Provider } from "../../src/Model.js";
import "./globals.js";
import { navigate } from "./helpers.js";

describe("Calculator", () => {
  const shouldSkip = () => {
    if (
      (process.env.ALUMNIUM_DRIVER || "selenium") === "appium" &&
      [Provider.ANTHROPIC, Provider.AWS_ANTHROPIC].includes(
        Model.current.provider
      )
    ) {
      return "Incorrect element is identified";
    }

    return null;
  };

  before(async () => {
    // Mistral skips '+' button.
    await al.learn("4 / 2 =", [
      "click button '4'",
      "click button '÷'",
      "click button '2'",
      "click button '='",
    ]);
  });

  after(async () => {
    await al.clearLearnExamples();
  });

  it("addition", async () => {
    await navigate(driver, "https://seleniumbase.io/apps/calculator");
    await al.do("2 + 2 =");
    const result = await al.get("value from textfield");
    assert.strictEqual(result, 4);
  });

  it("subtraction", async () => {
    await navigate(driver, "https://seleniumbase.io/apps/calculator");
    await al.do("5 - 3 =");
    const result = await al.get("value from textfield");
    assert.strictEqual(result, 2);
  });

  it("multiplication", async function () {
    if (shouldSkip()) {
      this.skip();
    }

    await navigate(driver, "https://seleniumbase.io/apps/calculator");
    await al.do("3 * 4 =");
    const result = await al.get("value from textfield");
    assert.strictEqual(result, 12);
  });

  it("division", async () => {
    await navigate(driver, "https://seleniumbase.io/apps/calculator");
    await al.do("8 / 2 =");
    const result = await al.get("value from textfield");
    assert.strictEqual(result, 4);
  });
});
