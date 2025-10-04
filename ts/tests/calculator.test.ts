import { Builder, WebDriver } from 'selenium-webdriver';
import { Options } from 'selenium-webdriver/chrome';
import { Alumni } from '../src';

describe('Calculator Tests', () => {
  let driver: WebDriver;
  let al: Alumni;

  beforeAll(async () => {
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

  afterAll(async () => {
    await al.quit();
  });

  beforeEach(async () => {
    // Learn example for division operator mapping
    await al.learn('4 / 2 =', [
      "click button '4'",
      "click button '÷'",
      "click button '2'",
      "click button '='",
    ]);
  });

  afterEach(async () => {
    await al.clearLearnExamples();
  });

  test('addition', async () => {
    await driver.get('https://seleniumbase.io/apps/calculator');
    await al.do('2 + 2 =');
    const result = await al.get('value from textfield');
    expect(result).toBe(4);
  }, 60000);

  // test('subtraction', async () => {
  //   await driver.get('https://seleniumbase.io/apps/calculator');
  //   await al.do('5 - 3 =');
  //   const result = await al.get('value from textfield');
  //   expect(result).toBe(2);
  // }, 60000);

  // test('multiplication', async () => {
  //   await driver.get('https://seleniumbase.io/apps/calculator');
  //   await al.do('3 * 4 =');
  //   const result = await al.get('value from textfield');
  //   expect(result).toBe(12);
  // }, 60000);

  // test('division', async () => {
  //   await driver.get('https://seleniumbase.io/apps/calculator');
  //   await al.do('8 / 2 =');
  //   const result = await al.get('value from textfield');
  //   expect(result).toBe(4);
  // }, 60000);
});
