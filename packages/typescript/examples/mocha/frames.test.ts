import assert from "assert";
import "./globals.js";
import { navigate } from "./helpers.js";

describe("Frames", () => {
  const shouldSkip = () => {
    const driverType = process.env.ALUMNIUM_DRIVER || "selenium";
    if (driverType === "appium") {
      return "Frames support is only implemented for Playwright and Selenium currently";
    }

    return null;
  };

  it("nested frames", async function () {
    if (shouldSkip()) {
      this.skip();
    }

    await navigate(driver, "https://the-internet.herokuapp.com/nested_frames");

    await al.do("click MIDDLE text");
    assert.deepStrictEqual(await al.get("text from all frames"), [
      "LEFT",
      "MIDDLE",
      "RIGHT",
      "BOTTOM",
    ]);
  });

  it("cross origin iframe", async function () {
    if (shouldSkip()) {
      this.skip();
    }

    await navigate(driver, "cross_origin_iframe.html");

    await al.check("button 'Main Page Button' is present");
    await al.do("click button 'Click Me Inside Iframe'");
    await al.check("text 'Button Clicked!' is present");
    await al.do("click link 'Iframe Link'");
    await al.check("text 'Link Clicked!' is present");
  });
});
