import { Builder, WebDriver } from 'selenium-webdriver';
import { Options } from 'selenium-webdriver/chrome.js';
import { Alumni } from '../src/Alumni.js';

let driver: WebDriver;
let al: Alumni;

export const mochaHooks = {
  async beforeAll() {
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

    // Make available globally
    (global as any).driver = driver;
    (global as any).al = al;
  },

  async afterEach(this: Mocha.Context) {
    if (this.currentTest?.state === 'failed') {
      await al.cache?.discard();
    } else {
      await al.cache?.save();
    }
  },

  async afterAll() {
    await al.quit();
  },
};
