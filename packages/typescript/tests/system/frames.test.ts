import { describe } from "vitest";
import { baseIt } from "./helpers.ts";

describe("Frames", () => {
  const it = baseIt.override("setup", async ({ setup, skip }) => {
    return async (options) => {
      const result = await setup(options);
      const { isAppiumDriver } = result;

      // Frames support is not implemented in Appium yet
      if (isAppiumDriver)
        skip("Frames support is not implemented in Appium yet");

      return result;
    };
  });

  it("nested frames", async ({ expect, setup }) => {
    const { al, $ } = await setup();

    await $.navigate("https://the-internet.herokuapp.com/nested_frames");

    await al.do("click MIDDLE text");

    const texts = await al.get("text from all frames");
    expect(texts).toEqual(["LEFT", "MIDDLE", "RIGHT", "BOTTOM"]);
  });

  it("cross origin iframe", async ({ expect, setup, skip }) => {
    const { al, $, driverId } = await setup();
    const assert = expect.assert;

    if (driverId !== "playwright")
      skip("Frames support is only implemented for Playwright currently");

    await $.navigate("cross_origin_iframe.html");

    await al.check("'Main Page Button' is present", { assert });
    await al.check("'Password' field is present", { assert });

    await al.do("type 'testuser' in the text input field");
    await al.check("Text input contains 'testuser'", { assert });

    await al.do("click Submit button");
    await al.check("'Form submitted' message is present", { assert });
  });
});
