import { DragSliderTool } from "alumnium";
import { describe } from "vitest";
import { baseIt } from "./helpers.js";

describe("Drag Slider", () => {
  const it = baseIt.override("setup", async ({ setup, skip }) => {
    return async (options) => {
      const result = await setup(options);
      const { driverType } = result;

      // Drag slider is not implemented in Appium yet
      if (driverType === "appium")
        skip("Drag slider is not implemented in Appium yet");

      return result;
    };
  });

  it("sets slider value", async ({ expect, setup }) => {
    const { al, $ } = await setup({
      extraTools: [DragSliderTool],
    });

    await $.navigate("slider.html");

    await al.do("drag the slider to 70");
    await al.check("the slider value is 70", {
      assert: expect.assert,
    });

    await al.do("drag the slider to 33");
    await al.check("the slider value is 33", {
      assert: expect.assert,
    });
  });
});
