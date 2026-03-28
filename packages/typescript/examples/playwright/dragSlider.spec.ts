import { Alumni, DragSliderTool } from "alumnium";
import { resolveURL } from "../mocha/helpers.js";
import { test } from "./index.js";

test.describe("Drag Slider", () => {
  let al: Alumni;

  test.beforeEach(({ page }) => {
    al = new Alumni(page, {
      extraTools: [DragSliderTool],
    });
  });

  test("sets slider value", async ({ page }) => {
    await page.goto(resolveURL("slider.html"));

    await al.do("drag the slider to 70");
    await al.check("the slider value is 70");

    await al.do("drag the slider to 33");
    await al.check("the slider value is 33");
  });
});
