import { describe } from "vitest";
import { baseIt } from "./helpers.ts";

describe("Shadow DOM", () => {
  const it = baseIt.override("setup", async ({ setup, skip }) => {
    return async (options) => {
      const result = await setup(options);
      const { isAppiumDriver } = result;

      if (isAppiumDriver)
        skip("Shadow DOM support is not implemented in Appium yet");

      return result;
    };
  });

  it("pierces Shadow DOM content", async ({ expect, setup }) => {
    const { al, $ } = await setup();

    await $.navigate("shadow_dom.html");

    expect(await al.get("second paragraph")).toContain(
      "This is inside Shadow DOM!",
    );
    await al.do("click first shadow button");
    expect(await al.get("second paragraph")).toContain(
      "Shadow Button 1 was clicked!",
    );

    expect(await al.get("third paragraph")).toContain(
      "This is another text inside Shadow DOM!",
    );
    await al.do("click second shadow button");
    expect(await al.get("third paragraph")).toContain(
      "Shadow Button 2 was clicked!",
    );
  });
});
