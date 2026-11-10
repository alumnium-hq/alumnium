import { describe } from "vitest";
import { DragSliderTool } from "alumnium";
import { baseIt } from "./helpers.ts";

describe("Drag Slider", () => {
  const it = baseIt.override("setup", async ({ setup, skip }) => {
    return async (options) => {
      const result = await setup(options);
      const { isMobile } = result;

      // Drag slider is not implemented in Appium yet
      if (isMobile) skip("Drag slider is not implemented in Appium yet");

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

  it("sets a pointer-only ARIA slider value", async ({ expect, setup }) => {
    const { al, $ } = await setup({
      extraTools: [DragSliderTool],
    });

    await $.navigate("aria_slider.html");

    await al.do("drag the distance slider to 70");
    await al.check("the distance is 70 miles", {
      assert: expect.assert,
    });

    await al.do("drag the distance slider to 30");
    await al.check("the distance is 30 miles", {
      assert: expect.assert,
    });
  });

  it("sets a slider on a page that tracks its value", async ({
    expect,
    setup,
  }) => {
    const { al, $ } = await setup({
      extraTools: [DragSliderTool],
    });

    await $.navigate("controlled_slider.html");

    await al.do("drag the storage slider to 20");
    await al.check("the storage is 20 TB", {
      assert: expect.assert,
    });
  });

  it("sets both handles of a range slider", async ({ expect, setup }) => {
    const { al, $ } = await setup({
      extraTools: [DragSliderTool],
    });

    await $.navigate("range_slider.html");

    await al.do("drag the maximum price slider to 20");
    await al.check("the price is $0 – $20", {
      assert: expect.assert,
    });

    await al.do("drag the minimum price slider to 15");
    await al.check("the price is $15 – $20", {
      assert: expect.assert,
    });
  });
});
