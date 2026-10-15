import { describe } from "vitest";
import { baseIt } from "./helpers.ts";

describe("Airbnb", () => {
  const it = baseIt.override("setup", async ({ setup, skip }) => {
    return async (options) => {
      const result = await setup(options);
      if (result.driverId !== "playwright")
        skip("Only Playwright handles this test");

      return result;
    };
  });

  it(
    "searches for a stay in Paris and opens a listing",
    { timeout: 10 * 60_000 }, // 10 minutes
    async ({ expect, setup }) => {
      const { al, $ } = await setup();
      const checkIn = new Date(
        +new Date() + 1 * 24 * 60 * 60 * 1000, // 1 day from now
      ).toLocaleDateString();
      const checkOut = new Date(
        +new Date() + 3 * 24 * 60 * 60 * 1000, // 3 days from now
      ).toLocaleDateString();

      await $.navigate("https://www.airbnb.com/");
      await al.do("accept cookies if prompted");
      await al.do("close any pop-ups if they appear");

      await al.do("type Paris into the 'Where' destination search field");
      await al.do(
        "click the 'Paris, France' suggestion in the autocomplete list",
      );
      await al.do(`click the ${checkIn} day in the calendar`);
      await al.do(`click the ${checkOut} day in the calendar`);

      await al.do("click the 'Who' button to open the guests selector");
      await al.do("click the 'increase adults' button");
      await al.do("click the 'increase adults' button");
      await al.do("click the 'increase children' button");
      await al.do("click the search button");
      await al.do("close any pop-ups if they appear");
      await al.check("the search results are for stays in Paris", {
        assert: expect.assert,
      });

      await al.do("click the first listing in the search results");
      await al.do("close any pop-ups if they appear");
      await al.check("the url contains /rooms", { assert: expect.assert });
      await al.check("the listing is located in Paris or the Paris area", {
        assert: expect.assert,
      });
      await al.check(`the reservation box shows ${checkIn} as check-in date`, {
        assert: expect.assert,
      });
      await al.check(
        `the reservation box shows ${checkOut} as check-out date`,
        {
          assert: expect.assert,
        },
      );
    },
  );
});
