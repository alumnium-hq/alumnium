import { Alumni } from "../../src/Alumni.js";
import { SwitchToNextTabTool } from "../../src/tools/SwitchToNextTabTool.js";
import { SwitchToPreviousTabTool } from "../../src/tools/SwitchToPreviousTabTool.js";
import { resolveURL } from "../mocha/helpers.js";
import { expect, test } from "./index.js";

test.describe("Tabs", () => {
  let al: Alumni;

  test.beforeEach(({ page }) => {
    al = new Alumni(page, {
      extraTools: [SwitchToNextTabTool, SwitchToPreviousTabTool],
    });
  });

  test.afterEach(async () => {
    await al.quit();
  });

  test("switching tabs", async ({ page }) => {
    await page.goto(resolveURL("multi_tab_page.html"));

    await al.do("click on 'Open New Tab' button");
    expect(await al.get("current page URL")).toBe("about:blank");

    await al.do("switch to previous browser tab");
    expect(await al.get("header text")).toBe("Multi-Tab Test Page");

    await al.do("switch to next browser tab");
    expect(await al.get("current page URL")).toBe("about:blank");

    await al.do("switch to next browser tab");
    expect(await al.get("header text")).toBe("Multi-Tab Test Page");

    await al.do("switch to previous browser tab");
    expect(await al.get("current page URL")).toBe("about:blank");
  });
});
