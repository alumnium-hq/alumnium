import { test as base } from "@playwright/test";
import { Alumni } from "../../src/Alumni.js";

export const test = base.extend<{ al: Alumni }>({
  al: async ({ page }, use) => {
    const al = new Alumni(page);
    await use(al);
    await al.quit();
  },
});

export { expect } from "@playwright/test";
