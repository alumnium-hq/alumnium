import { resolveURL } from "../mocha/helpers.js";
import { expect, test } from "./index.js";

test.describe("Frames", () => {
  test("nested frames", async ({ page, al }) => {
    await page.goto("https://the-internet.herokuapp.com/nested_frames");

    await al.do("click MIDDLE text");
    expect(await al.get("text from all frames")).toEqual([
      "LEFT",
      "MIDDLE",
      "RIGHT",
      "BOTTOM",
    ]);
  });

  test("cross origin iframe", async ({ page, al }) => {
    await page.goto(resolveURL("cross_origin_iframe.html"));

    await al.check("button 'Main Page Button' is visible");
    await al.do("click button 'Click Me Inside Iframe'");
    await al.check("text 'Button Clicked!' is visible");
    await al.do("click link 'Iframe Link'");
    await al.check("text 'Link Clicked!' is visible");
  });
});
