import { NavigateBackTool } from "alumnium";
import { describe } from "vitest";
import { baseIt } from "./helpers.ts";

describe("Navigation", () => {
  const it = baseIt.override("setup", async ({ setup, skip }) => {
    return async (options) => {
      const result = await setup(options);
      const { model } = result;

      if (model.provider === "mistralai")
        skip("Mistral needs more work on navigation");

      return result;
    };
  });

  it("navigate back uses history", async ({ expect, setup }) => {
    const { al, $ } = await setup({
      extraTools: [NavigateBackTool],
    });

    const indexUrl = $.resolveUrl("the-internet/index.html");
    await $.navigate(indexUrl);
    expect(await al.driver.url()).toBe(indexUrl);

    await al.do("open typos");
    expect(await al.driver.url()).toBe($.resolveUrl("the-internet/typos.html"));

    await al.do("navigate back to the previous page");
    expect(await al.driver.url()).toBe(indexUrl);
  });
});
