import { describe } from "vitest";
import { baseIt } from "./helpers.ts";

describe("Complex apps", () => {
  describe("web", () => {
    const it = baseIt.override("setup", async ({ setup, skip }) => {
      return async (options) => {
        const result = await setup(options);
        const { isAppiumDriver } = result;

        // Skip if using Appium driver
        if (isAppiumDriver)
          skip("Example is web-only and does not support mobile");

        return result;
      };
    });

    it("YouTube", async ({ expect, setup }) => {
      const { al, $ } = await setup();

      await $.navigate("https://www.youtube.com");

      await al.do("search for 'lofi beats'");

      await al.check("search results are relevant to 'lofi beats' query", {
        assert: expect.assert,
      });
    });

    it("Airbnb", async ({ expect, setup }) => {
      const { al, $ } = await setup();

      await $.navigate("https://www.airbnb.com");

      await al.do("close any popups or modals if present");

      await al.do("select 'Singapore' as the destination");

      await al.do("select the first available check-in date");

      await al.do(
        "select the next day after the check-in date as the check-out date",
      );

      await al.do("select 1 adult as the number of guests");

      await al.do("press the search button");

      await al.check("search results show listings in Singapore", {
        assert: expect.assert,
      });
    });

    it("GitHub", async ({ expect, setup }) => {
      const { al, $ } = await setup();

      await $.navigate("https://github.com");

      await al.do("click the search button in the header");

      await al.do("type in 'alumnium' in the search input");

      await al.do("select 'alumnium' from the search suggestions");

      await al.check("search results are relevant to 'alumnium' query", {
        assert: expect.assert,
      });
    });

    it("Claude", async ({ expect, setup }) => {
      const { al, $ } = await setup();

      await $.navigate("https://claude.com/");

      await al.do("find and click the 'Claude Code' link in the menu");

      await al.check("page contains the download link for Claude Code", {
        assert: expect.assert,
      });
    });

    it("Cloudflare", async ({ expect, setup }) => {
      const { al, $ } = await setup();

      await $.navigate("https://www.cloudflare.com/");

      await al.do("find and click the developer documentation link");

      await al.do("press the search button in the header");

      await al.do("type in 'workers' in the search input");

      await al.do("select the first item from the search suggestions");

      await al.check("page content should be about 'Cloudflare Workers'", {
        assert: expect.assert,
      });
    });
  });
});
