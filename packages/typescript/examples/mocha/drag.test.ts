import { Alumni } from "../../src/Alumni.js";
import { DragTool } from "../../src/tools/DragTool.js";
import "./globals.js";
import { navigate } from "./helpers.js";

describe("Drag", () => {
  it("moves element", async function () {
    const al = new Alumni(driver, {
      extraTools: [DragTool],
    });

    await navigate(driver, "slider.html");

    await al.do("drag the slider to the right by 10 pixels");
    await al.check("the slider value is greater than 50");

    await al.do("drag the slider to the left by 10 pixels");
    await al.check("the slider value is less than or equal to 50");
  });
});
