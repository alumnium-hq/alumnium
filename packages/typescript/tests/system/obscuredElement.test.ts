import { describe } from "vitest";
import { baseIt } from "./helpers.ts";

describe("Obscured Element", () => {
  const it = baseIt.override("setup", async ({ setup, skip }) => {
    return async (options) => {
      const result = await setup(options);
      const { isAppiumDriver } = result;

      if (isAppiumDriver) skip("Not supported on Appium driver yet");

      return result;
    };
  });

  it("clicks an element covered by a sticky bar", async ({ expect, setup }) => {
    const { al, $ } = await setup();

    await $.navigate("obscured_element.html");
    await al.do("click the 'Click Me' button");
    expect(await al.get("status message")).toContain("button clicked");
  });
});
