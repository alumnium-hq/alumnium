import { describe } from "vitest";
import { baseIt } from "./helpers.ts";

describe("Select", () => {
  const it = baseIt.override("setup", async ({ setup, skip }) => {
    return async (options) => {
      const result = await setup(options);
      const { driverId, model } = result;

      if (driverId === "appium-ios")
        skip("Appium doesn't support select tool yet");
      if (model.provider === "ollama") skip("Poor instruction following");
      if (model.provider === "deepseek" || model.provider === "xai")
        skip("Requires a separate check agent");

      return result;
    };
  });

  it("selects an option", async ({ expect, setup }) => {
    const { al, $ } = await setup();
    await $.navigate("https://the-internet.herokuapp.com/dropdown");

    await al.check("Option 1 is not selected", { assert: expect.assert });
    await expect(al.check("Option 1 is selected")).rejects.toThrow();
    await al.check("Option 2 is not selected", { assert: expect.assert });
    await expect(al.check("Option 2 is selected")).rejects.toThrow();

    await al.do("select 'Option 1'");

    await al.check("Option 1 is selected", { assert: expect.assert });
    await expect(al.check("Option 1 is not selected")).rejects.toThrow();
    await al.check("Option 2 is not selected", { assert: expect.assert });
    await expect(al.check("Option 2 is selected")).rejects.toThrow();
  });
});
