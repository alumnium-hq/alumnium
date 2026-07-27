import { Alumni } from "alumnium";
import { test } from "@playwright/test";

test.setTimeout(120_000);

test.describe("Search", async () => {
  let al: Alumni;

  test.beforeEach(async ({ page }) => {
    al = new Alumni(page);
  });

  test.afterEach(async () => {
    await al.quit();
  });

  test("gives relevant results for 'lofi beats'", async ({ page }) => {
    await page.goto("https://youtube.com");
    await al.do("search for 'lofi beats' and press Enter");
    await al.check("page title contains 'lofi beats'");
    await al.check("search results contain lofi videos");
  });
});
