import { describe } from "vitest";
import { baseIt } from "./helpers.ts";

describe("BrowserStack Demo", () => {
  const it = baseIt.override("setup", async ({ setup, skip }) => {
    return async (options) => {
      const result = await setup(options);

      await result.al.learn("add 'Laptop' to cart", [
        "click button 'Add to cart' next to 'Laptop' product",
      ]);
      await result.$.navigate("https://bstackdemo.com");

      if (result.driverId === "appium-ios")
        skip("https://github.com/alumnium-hq/alumnium/issues/132");
      if (
        result.model.provider === "aws_meta" ||
        result.model.provider === "mistralai"
      )
        skip("Needs more tuning");

      return result;
    };
  });

  it("checks out", async ({ expect, setup }) => {
    const { al } = await setup();

    await al.do("add 'iPhone 12 Pro Max' to cart");
    await al.do("add 'iPhone 12 Mini' to cart");
    const cart = await al.area("shopping cart including added products");
    expect(await cart.get("titles of products")).toEqual([
      "iPhone 12 Pro Max",
      "iPhone 12 Mini",
    ]);
    expect(await cart.get("quantity of iPhone 12 Pro Max")).toBe(1);
    expect(await cart.get("quantity of iPhone 12 Mini")).toBe(1);

    await al.do("go to checkout");
    await al.do("type 'demouser' into username field");
    await al.do("click 'demouser' in username field suggestions");
    await al.do("type 'testingisfun99' into password field");
    await al.do("click 'testingisfun99' in password field suggestions");
    await al.do("click login button");

    expect(await al.get("iPhone 12 Pro Max price (without money sign)")).toBe(
      1099,
    );
    expect(await al.get("iPhone 12 Mini price (without money sign)")).toBe(699);
    expect(await al.get("total amount (without money sign)")).toBe(1798);

    await al.do(
      "submit with {'first name': 'Al', 'last name': 'Um', 'address': '1st Market Street', 'state': 'CA', 'postal code': 95122}",
    );
    await al.check("order is placed message is shown", {
      assert: expect.assert,
    });
  });
});
