import { test as base } from "@playwright/test";
import { Alumni } from "../../src/Alumni.js";

export const test = base.extend<{ al: Alumni }>({
  al: async ({ page }, use) => {
    const al = new Alumni(page);

    await al.learn('create a new task "this is Al"', [
      'type "this is Al" to a text field',
      "press key 'Enter'",
    ]);
    await al.learn('mark the "this is Al" task as completed', [
      'click checkbox near the "this is Al" task',
    ]);
    await al.learn('delete the "this is Al" task', [
      'hover the "this is Al" task',
      'click button "x" near the "this is Al" task',
    ]);

    await use(al);

    await al.clearLearnExamples();
    await al.quit();
  },
});

test.afterEach(async ({ al }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) {
    await al.cache.save();
  } else {
    await al.cache.discard();
  }
});

export { expect } from "@playwright/test";
