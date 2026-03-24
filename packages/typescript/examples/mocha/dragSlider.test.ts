import { Alumni } from "../../src/Alumni.js";
import { DragSliderTool } from "../../src/index.js";
import "./globals.js";
import { navigate } from "./helpers.js";

describe("Drag Slider", () => {
  const shouldSkip = () => {
    // Drag slider is not implemented in Appium yet
    const driverType = process.env.ALUMNIUM_DRIVER || "selenium";
    if (driverType === "appium") {
      return "Drag slider is not implemented in Appium yet";
    }
  };

  it("sets slider value", async function () {
    if (shouldSkip()) {
      this.skip();
    }
    const al = new Alumni(driver, {
      extraTools: [DragSliderTool],
    });

    await navigate(driver, "slider.html");

    await al.do("drag the slider to 70");
    await al.check("the slider value is 70");

    await al.do("drag the slider to 33");
    await al.check("the slider value is 33");
  });
});
