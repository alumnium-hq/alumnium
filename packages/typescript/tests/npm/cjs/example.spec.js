const { expect, test } = require("@playwright/test");
const { Alumni } = require("alumnium");

test("Alumni works", async ({ page }) => {
  test.setTimeout(5 * 60_000); // 5 minutes

  const al = new Alumni(page);
  await page.goto("https://seleniumbase.io/apps/calculator");
  await al.do("2 + 2 =");
  const result = await al.get("calculator result from textfield");

  expect(result).toBe(4);
});
