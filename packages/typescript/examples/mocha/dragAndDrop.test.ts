import assert from "assert";
import { Model, Provider } from "../src/Model.js";
import "./globals.js";

describe("Drag and Drop Tests", () => {
  const shouldSkip = () => {
    // Skip if using DeepSeek (no vision support yet)
    if (Model.current.provider === Provider.DEEPSEEK) {
      return "DeepSeek does not support vision yet";
    }

    // Skip if using Appium driver (no drag and drop support in mobile browsers)
    const driverType = process.env.ALUMNIUM_DRIVER || "selenium";
    if (driverType === "appium") {
      return "Example doesn't support drag and drop in mobile browsers";
    }

    return null;
  };

  it("drag and drop", async function () {
    if (shouldSkip()) {
      this.skip();
    }

    await driver.get("https://the-internet.herokuapp.com/drag_and_drop");

    const initialOrder = await al.get(
      "titles of squares ordered from left to right",
      true
    );
    assert.deepStrictEqual(initialOrder, ["A", "B"]);

    await al.do("move square A to square B");

    const finalOrder = await al.get(
      "titles of squares ordered from left to right",
      true
    );
    assert.deepStrictEqual(finalOrder, ["B", "A"]);
  });
});
