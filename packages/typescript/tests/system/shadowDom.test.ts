import { describe } from "vitest";
import { baseIt } from "./helpers.ts";

describe("Shadow DOM", () => {
  const it = baseIt.override("setup", async ({ setup, skip }) => {
    return async (options) => {
      const result = await setup(options);
      const { isAppiumDriver, driverId } = result;

      if (isAppiumDriver || driverId === "selenium")
        skip(
          "Shadow DOM support is not implemented in Appium and Selenium yet",
        );

      return result;
    };
  });

  it("pierces Shadow DOM content", async ({ expect, setup }) => {
    const { al, $ } = await setup();

    await $.navigate("shadow_dom.html");

    const tree = (await al.driver.getAccessibilityTree()).toStr();
    expect(tree).toContain("This is inside Shadow DOM!");
    expect(tree).toContain("This is another text inside Shadow DOM!");

    await al.do("click 'Shadow Button 1'");
    await al.check("page contains 'This is inside Shadow DOM!'", {
      assert: expect.assert,
    });

    const result = await al.get("text in the first shadow DOM paragraph");
    expect(result).toContain("This is inside Shadow DOM!");
  });
});
