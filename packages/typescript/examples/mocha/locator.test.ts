import assert from "assert";
import "./globals.js";

describe("Locator Tests", () => {
  it("locator", async () => {
    await driver.get(
      "https://bonigarcia.dev/selenium-webdriver-java/web-form.html"
    );

    const textInput = await al.find("text input");
    assert.notStrictEqual(textInput, null);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    await (textInput as any).sendKeys("Hello Alumnium!");

    const textarea = await al.find("textarea");
    assert.notStrictEqual(textarea, null);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    await (textarea as any).sendKeys("Testing the LocatorAgent");

    const submitButton = await al.find("submit button");
    assert.notStrictEqual(submitButton, null);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    await (submitButton as any).click();
  });
});
