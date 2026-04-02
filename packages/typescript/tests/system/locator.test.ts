import { describe } from "vitest";
import { it } from "./helpers.ts";

describe("Locator", () => {
  it("finds elements", async ({ expect, setup }) => {
    const { al, $ } = await setup();

    await $.navigate(
      "https://bonigarcia.dev/selenium-webdriver-java/web-form.html",
    );

    const textInput = await al.find("text input");

    expect(textInput).not.toBeNull();
    await $.type(textInput, "Hello Alumnium!");

    const textarea = await al.find("textarea");
    expect(textarea).not.toBeNull();
    await $.type(textarea, "Testing the LocatorAgent");

    const submitButton = await al.find("submit button");
    expect(submitButton).not.toBeNull();
    await $.click(submitButton);
  });
});
