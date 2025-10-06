/// <reference path="./globals.d.ts" />

import { Alumni } from '../src/Alumni.js';
import { NavigateBackTool } from '../src/tools/NavigateBackTool.js';
import { Model, Provider } from '../src/Model.js';
import assert from 'assert';

describe('Navigation Tests', () => {
  const shouldSkip = () => {
    if (
      Model.current.provider === Provider.ANTHROPIC ||
      Model.current.provider === Provider.AWS_ANTHROPIC
    ) {
      return 'https://github.com/alumnium-hq/alumnium/issues/106';
    }
    if (Model.current.provider === Provider.MISTRALAI) {
      return 'Needs more work';
    }
    return null;
  };

  it('navigate back uses history', async function () {
    if (shouldSkip()) {
      this.skip();
    }

    const alWithNavBack = new Alumni(driver, {
      extraTools: [NavigateBackTool],
    });

    await driver.get('https://the-internet.herokuapp.com');
    assert.strictEqual(await alWithNavBack.driver.url(), 'https://the-internet.herokuapp.com/');

    await alWithNavBack.do('open typos');
    assert.strictEqual(await alWithNavBack.driver.url(), 'https://the-internet.herokuapp.com/typos');

    await alWithNavBack.do('navigate back to the previous page');
    assert.strictEqual(await alWithNavBack.driver.url(), 'https://the-internet.herokuapp.com/');
  });
});
