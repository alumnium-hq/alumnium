import { Alumni } from '../src/Alumni.js';
import { test as base } from '@playwright/test';

export const test = base.extend<{ al: Alumni }>({
  al: async ({ page }, use) => {
    const al = new Alumni(page);
    await use(al);
    await al.quit()
  },
});

export { expect } from '@playwright/test';
