import { NavigateBackTool } from "alumnium";
import { describe } from "vitest";
import { baseIt } from "./helpers.js";

describe("Navigation", () => {
  const it = baseIt.override("setup", async ({ setup, skip }) => {
    return async (options) => {
      const result = await setup(options);
      const { al } = result;

      if (al.model.provider === "mistralai")
        skip("Mistral needs more work on navigation");

      return result;
    };
  });

  it("navigate back uses history", async ({ expect, setup }) => {
    const { al, $ } = await setup({
      extraTools: [NavigateBackTool],
    });

    await $.navigate("https://the-internet.herokuapp.com");
    expect(await al.driver.url()).toBe("https://the-internet.herokuapp.com/");

    await al.do("open typos");
    expect(await al.driver.url()).toBe(
      "https://the-internet.herokuapp.com/typos",
    );

    await al.do("navigate back to the previous page");
    expect(await al.driver.url()).toBe("https://the-internet.herokuapp.com/");
  });
});
