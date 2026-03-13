import { Alumni, Model, NavigateBackTool } from "alumnium";
import assert from "assert";
import "./globals.js";
import { navigate } from "./helpers.js";

describe("Navigation", () => {
  const shouldSkip = () => {
    if (Model.current.provider === "mistralai") {
      return "Needs more work";
    }
    return null;
  };

  it("navigate back uses history", async function () {
    if (shouldSkip()) {
      this.skip();
    }

    const alWithNavBack = new Alumni(driver, {
      extraTools: [NavigateBackTool],
    });

    await navigate(driver, "https://the-internet.herokuapp.com");
    assert.strictEqual(
      await alWithNavBack.driver.url(),
      "https://the-internet.herokuapp.com/",
    );

    await alWithNavBack.do("open typos");
    assert.strictEqual(
      await alWithNavBack.driver.url(),
      "https://the-internet.herokuapp.com/typos",
    );

    await alWithNavBack.do("navigate back to the previous page");
    assert.strictEqual(
      await alWithNavBack.driver.url(),
      "https://the-internet.herokuapp.com/",
    );
  });
});
