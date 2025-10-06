import { test, expect } from './index.js';


test.describe('Calculator Tests', () => {
  test.beforeEach(async ({ al }) => {
    // Learn example for division operator mapping
    await al.learn('4 / 2 =', [
      "click button '4'",
      "click button '÷'",
      "click button '2'",
      "click button '='",
    ]);
  });

  test.afterEach(async ({ al }) => {
    await al.clearLearnExamples();
  });

  test('addition', async ({ al, page }) => {
    await page.goto('https://seleniumbase.io/apps/calculator');
    await al.do('2 + 2 =');
    const result = await al.get('value from textfield');
    expect(result).toBe(4);
  });
});
