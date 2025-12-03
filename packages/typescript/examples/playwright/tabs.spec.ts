import { expect, test } from "./index.js";

test.describe("Tabs", () => {
  test("autoswitch to new tab", async ({ page, al }) => {
    await page.goto("https://the-internet.herokuapp.com/windows");
    await al.do("click on 'Click Here' link");

    const headerText = await al.get("header text");
    expect(headerText).toBe("New Window");
  });
});
