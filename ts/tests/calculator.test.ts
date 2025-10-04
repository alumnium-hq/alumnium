import { Builder, WebDriver } from 'selenium-webdriver';
import { Options } from 'selenium-webdriver/chrome';
import { Alumni } from '../src';
import assert from 'assert';

describe('Calculator Tests', () => {
  let driver: WebDriver;
  let al: Alumni;

  before(async () => {
    const options = new Options();
    options.addArguments('--disable-blink-features=AutomationControlled');
    options.setUserPreferences({
      credentials_enable_service: false,
      profile: {
        password_manager_enabled: false,
        password_manager_leak_detection: false,
      },
    });

    driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();

    al = new Alumni(driver, {
      url: 'http://localhost:8013',
    });
  });

  afterEach(async function() {
    if (this.currentTest?.state === 'failed') {
      await al.cache?.discard();
    } else {
      await al.cache?.save();
    }
  });

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
    await al.quit();
  });

  it('addition', async function() {
    this.timeout(60000);
    await driver.get('https://seleniumbase.io/apps/calculator');
    await al.do('2 + 2 =');
    const result = await al.get('value from textfield');
    assert.strictEqual(result, 4);
  });

  it('subtraction', async function() {
    this.timeout(60000);
    await driver.get('https://seleniumbase.io/apps/calculator');
    await al.do('5 - 3 =');
    const result = await al.get('value from textfield');
    assert.strictEqual(result, 2);
  });

  it('multiplication', async function() {
    this.timeout(60000);
    await driver.get('https://seleniumbase.io/apps/calculator');
    await al.do('3 * 4 =');
    const result = await al.get('value from textfield');
    assert.strictEqual(result, 12);
  });

  it('division', async function() {
    this.timeout(60000);
    await driver.get('https://seleniumbase.io/apps/calculator');
    await al.do('8 / 2 =');
    const result = await al.get('value from textfield');
    assert.strictEqual(result, 4);
  });
});
