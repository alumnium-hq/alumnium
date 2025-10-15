import assert from "assert";
import "./globals.js";
import { navigate, type } from "./helpers.js";

describe("Locator", () => {
  it("finds elements", async () => {
    await navigate(
      driver,
      "https://bonigarcia.dev/selenium-webdriver-java/web-form.html"
    );

    const textInput = await al.find("text input");
    assert.notStrictEqual(textInput, null);
    await type(textInput, "Hello Alumnium!");

    const textarea = await al.find("textarea");
    assert.notStrictEqual(textarea, null);
    await type(textarea, "Testing the LocatorAgent");

    const submitButton = await al.find("submit button");
    assert.notStrictEqual(submitButton, null);
    await submitButton.click();
  });
});
