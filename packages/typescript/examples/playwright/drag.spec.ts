import { Alumni } from "../../src/Alumni.js";
import { DragTool } from "../../src/tools/DragTool.js";
import { resolveURL } from "../mocha/helpers.js";
import { test } from "./index.js";

test.describe("Drag", () => {
  let al: Alumni;

  test.beforeEach(({ page }) => {
    al = new Alumni(page, {
      extraTools: [DragTool],
    });
  });

  test("moves element", async ({ page }) => {
    await page.goto(resolveURL("slider.html"));

    await al.do("drag the slider to the right by 10 pixels");
    await al.check("the slider value is greater than 50");

    await al.do("drag the slider to the left by 10 pixels");
    await al.check("the slider value is less than or equal to 50");
  });
});
