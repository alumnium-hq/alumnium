import { describe } from "vitest";
import { baseIt } from "./helpers.ts";

describe("Swag Labs", () => {
  const it = baseIt.override("setup", async ({ setup, skip }) => {
    return async (options) => {
      const result = await setup(options);
      const { al, driverId, model, $ } = result;

      await Promise.all([
        al.learn("add laptop to cart", [
          "click button 'Add to cart' next to 'laptop' product",
        ]),
        al.learn("go to shopping cart", [
          "click link after 'Swag Labs' with a number text in it",
        ]),
        al.learn("sort products by lowest shipping cost", [
          driverId === "appium-ios"
            ? "click generic element after 'Products' text"
            : "click combobox with options",
          driverId === "appium-ios"
            ? 'click "Shipping (low to high)"'
            : 'click option "Shipping (low to high)"',
        ]),
      ]);

      await $.navigate("https://www.saucedemo.com/");
      await al.do("type 'standard_user' into username field");
      await al.do("type 'secret_sauce' into password field");
      await al.do("click login button");
      await new Promise((resolve) => setTimeout(resolve, 1000));

      if (model.provider === "ollama") skip("Too hard for Mistral");

      return result;
    };
  });

  it("sorts products", async ({ expect, setup }) => {
    const { al } = await setup();
    const titles = [
      "Sauce Labs Backpack",
      "Sauce Labs Bike Light",
      "Sauce Labs Bolt T-Shirt",
      "Sauce Labs Fleece Jacket",
      "Sauce Labs Onesie",
      "Test.allTheThings() T-Shirt (Red)",
    ];
    const prices = [29.99, 9.99, 15.99, 49.99, 7.99, 15.99];

    expect(await al.get("titles of products")).toEqual(titles.toSorted());
    await al.do("sort products in descending alphabetical order");
    expect(await al.get("titles of products")).toEqual(
      titles.toSorted().toReversed(),
    );
    await al.do("sort products in ascending alphabetical order");
    expect(await al.get("titles of products")).toEqual(titles.toSorted());
    await al.do("sort products by lowest price");
    expect(await al.get("prices of products (without money sign)")).toEqual(
      prices.toSorted((a, b) => a - b),
    );
    await al.do("sort products by highest price");
    expect(await al.get("prices of products (without money sign)")).toEqual(
      prices.toSorted((a, b) => b - a),
    );
  });

  it("checks out", async ({ expect, setup, skip }) => {
    const { al, driverId, model } = await setup();

    if (driverId === "appium-ios")
      skip("https://github.com/alumnium-hq/alumnium/issues/132");
    if (model.provider === "mistralai")
      skip("Cannot figure out how to open cart");

    await al.do("add onesie to cart");
    await al.do("add backpack to cart");
    await al.do("go to shopping cart");
    expect(await al.get("titles of products in cart")).toEqual([
      "Sauce Labs Onesie",
      "Sauce Labs Backpack",
    ]);

    await al.do("go to checkout");
    await al.do("fill in first name - Al, last name - Um, ZIP - 95122");
    await al.do("continue checkout");
    expect(await al.get("item total without tax (without money sign)")).toBe(
      37.98,
    );
    expect(await al.get("tax amount (without money sign)")).toBe(3.04);
    expect(await al.get("total amount with tax (without money sign)")).toBe(
      41.02,
    );
    expect(await al.get("shipping information value")).toBe(
      "Free Pony Express Delivery!",
    );

    await al.do("finish checkout");
    await al.check("thank you for the order message is shown", {
      assert: expect.assert,
    });
    if (model.provider !== "deepseek")
      await al.check("big green checkmark is shown", {
        vision: true,
        assert: expect.assert,
      });
  });
});
