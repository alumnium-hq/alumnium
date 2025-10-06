/// <reference path="./globals.d.ts" />

import assert from 'assert';

describe('Calculator Tests', () => {
  before(async () => {
    // Learn example for division operator mapping
    await al.learn('4 / 2 =', [
      "click button '4'",
      "click button '÷'",
      "click button '2'",
      "click button '='",
    ]);
  });

  after(async () => {
    await al.clearLearnExamples();
  });

  it('addition', async () => {
    await driver.get('https://seleniumbase.io/apps/calculator');
    await al.do('2 + 2 =');
    const result = await al.get('value from textfield');
    assert.strictEqual(result, 4);
  });

  it('subtraction', async () => {
    await driver.get('https://seleniumbase.io/apps/calculator');
    await al.do('5 - 3 =');
    const result = await al.get('value from textfield');
    assert.strictEqual(result, 2);
  });

  it('multiplication', async () => {
    await driver.get('https://seleniumbase.io/apps/calculator');
    await al.do('3 * 4 =');
    const result = await al.get('value from textfield');
    assert.strictEqual(result, 12);
  });

  it('division', async () => {
    await driver.get('https://seleniumbase.io/apps/calculator');
    await al.do('8 / 2 =');
    const result = await al.get('value from textfield');
    assert.strictEqual(result, 4);
  });
});
