import assert from "assert";
import { Alumni } from "../../src/Alumni.js";
import { Model, Provider } from "../../src/Model.js";
import { NavigateBackTool } from "../../src/tools/NavigateBackTool.js";
import "./globals.js";
import { navigate } from "./helpers.js";

describe("Navigation", () => {
  const shouldSkip = () => {
    if (Model.current.provider === Provider.MISTRALAI) {
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
      "https://the-internet.herokuapp.com/"
    );

    await alWithNavBack.do("open typos");
    assert.strictEqual(
      await alWithNavBack.driver.url(),
      "https://the-internet.herokuapp.com/typos"
    );

    await alWithNavBack.do("navigate back to the previous page");
    assert.strictEqual(
      await alWithNavBack.driver.url(),
      "https://the-internet.herokuapp.com/"
    );
  });
});
