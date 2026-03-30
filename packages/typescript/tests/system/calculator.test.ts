import { describe } from "vitest";
import { baseIt } from "./helpers.js";

describe("Calculator", () => {
  const it = baseIt.override("setup", async ({ setup }) => {
    return async (options) => {
      const result = await setup(options);
      const { al } = result;

      // Mistral skips '+' button.
      if (al.model.provider === "mistralai")
        await result.al.learn("4 / 2 =", [
          "click button '4'",
          "click button '÷'",
          "click button '2'",
          "click button '='",
        ]);

      return result;
    };
  });

  it("addition", async ({ expect, setup }) => {
    const { al, $ } = await setup();
    await $.navigate("https://seleniumbase.io/apps/calculator");
    await al.do("2 + 2 =");
    const result = await al.get("value from textfield");
    expect(result).toBe(4);
  });

  it("subtraction", async ({ expect, setup }) => {
    const { al, $ } = await setup();
    await $.navigate("https://seleniumbase.io/apps/calculator");
    await al.do("5 - 3 =");
    const result = await al.get("value from textfield");
    expect(result).toBe(2);
  });

  it("multiplication", async ({ expect, setup }) => {
    const { al, $ } = await setup();
    await $.navigate("https://seleniumbase.io/apps/calculator");
    await al.do("3 * 4 =");
    const result = await al.get("value from textfield");
    expect(result).toBe(12);
  });

  it("division", async ({ expect, setup }) => {
    const { al, $ } = await setup();
    await $.navigate("https://seleniumbase.io/apps/calculator");
    await al.do("8 / 2 =");
    const result = await al.get("value from textfield");
    expect(result).toBe(4);
  });
});
