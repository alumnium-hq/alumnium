import { describe } from "vitest";
import { baseIt } from "./helpers.ts";

describe("Drag and Drop", () => {
  const it = baseIt.override("setup", async ({ setup, skip }) => {
    return async (options) => {
      const result = await setup(options);
      const { al, driverType } = result;

      // Skip if using DeepSeek (no vision support yet)
      if (al.model.provider === "deepseek")
        skip("DeepSeek does not support vision yet");

      // Skip if using Appium driver (no drag and drop support in mobile browsers)
      if (driverType.startsWith("appium"))
        skip("Example doesn't support drag and drop in mobile browsers");

      return result;
    };
  });

  it("works", async ({ expect, setup }) => {
    const { al, $ } = await setup();

    await $.navigate("https://the-internet.herokuapp.com/drag_and_drop");

    const initialOrder = await al.get(
      "titles of squares ordered from left to right",
      { vision: true },
    );
    expect(initialOrder).toEqual(["A", "B"]);

    await al.do("move square A to square B");

    const finalOrder = await al.get(
      "titles of squares ordered from left to right",
      { vision: true },
    );
    expect(finalOrder).toEqual(["B", "A"]);
  });
});
