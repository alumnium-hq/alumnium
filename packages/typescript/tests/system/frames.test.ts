import { describe } from "vitest";
import { baseIt } from "./helpers.js";

describe("Frames", () => {
  const it = baseIt.override("setup", async ({ setup, skip }) => {
    return async (options) => {
      const result = await setup(options);
      const { driverType } = result;

      // Frames support is not implemented in Appium yet
      if (driverType === "appium")
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

  it("cross origin iframe", async ({ expect, setup }) => {
    const { al, $ } = await setup();

    await $.navigate("cross_origin_iframe.html");

    await al.check("button 'Main Page Button' is present", {
      assert: expect.assert,
    });
    await al.do("click button 'Click Me Inside Iframe'");
    await al.check("text 'Button Clicked!' is present", {
      assert: expect.assert,
    });
    await al.do("click link 'Iframe Link'");
    await al.check("text 'Link Clicked!' is present", {
      assert: expect.assert,
    });
  });
});
