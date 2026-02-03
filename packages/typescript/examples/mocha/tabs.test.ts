import assert from "assert";
import { Alumni } from "../../src/Alumni.js";
import { SwitchToNextTabTool } from "../../src/tools/SwitchToNextTabTool.js";
import { SwitchToPreviousTabTool } from "../../src/tools/SwitchToPreviousTabTool.js";
import "./globals.js";
import { navigate } from "./helpers.js";

describe("Tabs", () => {
  it("switching tabs", async function () {
    const driverType = process.env.ALUMNIUM_DRIVER || "selenium";
    if (driverType === "appium") {
      this.skip();
    }

    const al = new Alumni(driver, {
      extraTools: [SwitchToNextTabTool, SwitchToPreviousTabTool],
    });

    await navigate(driver, "multi_tab_page.html");

    await al.do("click on 'Open New Tab' button");
    assert.strictEqual(await al.get("current page URL"), "about:blank");

    await al.do("switch to previous browser tab");
    assert.strictEqual(await al.get("header text"), "Multi-Tab Test Page");

    await al.do("switch to next browser tab");
    assert.strictEqual(await al.get("current page URL"), "about:blank");

    await al.do("switch to next browser tab");
    assert.strictEqual(await al.get("header text"), "Multi-Tab Test Page");

    await al.do("switch to previous browser tab");
    assert.strictEqual(await al.get("current page URL"), "about:blank");
  });
});
