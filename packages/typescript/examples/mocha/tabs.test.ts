import assert from "assert";
import "./globals.js";
import { navigate } from "./helpers.js";

describe("Tabs", () => {
  const shouldSkip = () => {
    const driverType = process.env.ALUMNIUM_DRIVER || "selenium";
    if (driverType === "appium") {
      return "Autoswitching is not implemented in Appium yet";
    }
    return null;
  };

  it("autoswitch to new tab", async function () {
    const skipReason = shouldSkip();
    if (skipReason) {
      this.skip();
    }

    await navigate(driver, "https://the-internet.herokuapp.com/windows");
    await al.do("click on 'Click Here' link");

    const headerText = await al.get("header text");
    assert.strictEqual(headerText, "New Window");
  });
});
