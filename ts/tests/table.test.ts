/// <reference path="./globals.d.ts" />

import { Model, Provider } from '../src/Model.js';
import assert from 'assert';

describe('Table Tests', () => {
  before(async () => {
    // These models double-click to sort
    if (
      Model.current.provider === Provider.ANTHROPIC ||
      Model.current.provider === Provider.AWS_ANTHROPIC ||
      Model.current.provider === Provider.GOOGLE ||
      Model.current.provider === Provider.MISTRALAI
    ) {
      await al.learn("sort by web site", ["click 'Web Site' header"]);
    }
  });

  after(async () => {
    await al.clearLearnExamples();
  });

  const shouldSkipAreaTests = () => {
    const driverType = process.env.ALUMNIUM_DRIVER || 'selenium';
    if (driverType === 'appium') {
      return 'Area is not properly extracted from Appium source code.';
    }
    return null;
  };

  it('table extraction', async function () {
    if (shouldSkipAreaTests()) {
      this.skip();
    }

    await driver.get('https://the-internet.herokuapp.com/tables');

    const area = await al.area('example 1 table');
    assert.strictEqual(await area.get("Jason Doe's due amount"), '$100.00');
    assert.strictEqual(await area.get("Frank Bach's due amount"), '$51.00');
    assert.strictEqual(await area.get("Tim Conway's due amount"), '$50.00');
    assert.strictEqual(await area.get("John Smith's due amount"), '$50.00');
  });

  it('table sorting', async function () {
    if (shouldSkipAreaTests()) {
      this.skip();
    }

    await driver.get('https://the-internet.herokuapp.com/tables');

    let table1 = await al.area('example 1 table - return table element');
    const table1FirstNames = await table1.get('first names');
    console.log('table1 first names:', table1FirstNames);
    assert.deepStrictEqual(table1FirstNames, ['John', 'Frank', 'Jason', 'Tim']);
    const table1LastNames = await table1.get('last names');
    console.log('table1 last names:', table1LastNames);
    assert.deepStrictEqual(table1LastNames, ['Smith', 'Bach', 'Doe', 'Conway']);

    let table2 = await al.area('example 2 table - return table element');
    const table2FirstNames = await table2.get('first names');
    console.log('table2 first names:', table2FirstNames);
    assert.deepStrictEqual(table2FirstNames, ['John', 'Frank', 'Jason', 'Tim']);
    const table2LastNames = await table2.get('last names');
    console.log('table2 last names:', table2LastNames);
    assert.deepStrictEqual(table2LastNames, ['Smith', 'Bach', 'Doe', 'Conway']);

    await table1.do('sort by last name');
    table1 = await al.area('example 1 table - return table element'); // refresh
    assert.deepStrictEqual(await table1.get('first names'), ['Frank', 'Tim', 'Jason', 'John']);
    assert.deepStrictEqual(await table1.get('last names'), ['Bach', 'Conway', 'Doe', 'Smith']);
    // example 2 table is not affected
    table2 = await al.area('example 2 table - return table element'); // refresh
    assert.deepStrictEqual(await table2.get('first names'), ['John', 'Frank', 'Jason', 'Tim']);
    assert.deepStrictEqual(await table2.get('last names'), ['Smith', 'Bach', 'Doe', 'Conway']);

    await table2.do('sort by first name');
    table2 = await al.area('example 2 table - return table element'); // refresh
    assert.deepStrictEqual(await table2.get('first names'), ['Frank', 'Jason', 'John', 'Tim']);
    assert.deepStrictEqual(await table2.get('last names'), ['Bach', 'Doe', 'Smith', 'Conway']);
    // example 1 table is not affected
    table1 = await al.area('example 1 table - return table element'); // refresh
    assert.deepStrictEqual(await table1.get('first names'), ['Frank', 'Tim', 'Jason', 'John']);
    assert.deepStrictEqual(await table1.get('last names'), ['Bach', 'Conway', 'Doe', 'Smith']);
  });

  it('retrieval of unavailable data', async () => {
    await driver.get('https://the-internet.herokuapp.com/tables');

    // This data is not available on the page.
    // Even though LLM knows the answer, it should not respond it.
    assert.strictEqual(await al.get('atomic number of Selenium'), null);
  });
});
