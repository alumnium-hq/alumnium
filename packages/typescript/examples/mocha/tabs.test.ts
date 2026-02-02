import assert from "assert";
import "./globals.js";
import { navigate } from "./helpers.js";

describe("Tabs", () => {
  it("autoswitch to new tab", async function () {
    await navigate(driver, "https://the-internet.herokuapp.com/windows");
    await al.do("click on 'Click Here' link");

    const headerText = await al.get("header text");
    assert.strictEqual(headerText, "New Window");
  });
});
