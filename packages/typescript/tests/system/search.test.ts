import { describe } from "vitest";
import { Env } from "../../src/Env.ts";
import { baseIt } from "./helpers.ts";

describe("Search", () => {
  const it = baseIt.override("setup", async ({ setup, skip }) => {
    return async (options) => {
      const result = await setup(options);

      if (result.driverId === "playwright" && Env.ALUMNIUM_PLAYWRIGHT_HEADLESS)
        skip("Brave Search blocks headless browsers");
      if (result.model.provider === "ollama")
        skip("Poor instruction following");

      return result;
    };
  });

  it("searches", async ({ expect, setup }) => {
    const { al, $ } = await setup();
    await $.navigate("https://search.brave.com");

    await al.do("type 'selenium' into the search field, then press 'Enter'");
    await al.check("page title contains selenium", { assert: expect.assert });
    expect(await al.get("atomic number")).toBe(34);
    await al.check("search results contain selenium.dev", {
      assert: expect.assert,
    });
    await expect(
      al.check("search results do not contain selenium.dev"),
    ).rejects.toThrow();
  });
});
