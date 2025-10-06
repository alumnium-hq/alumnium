import { Builder, WebDriver } from 'selenium-webdriver';
import { Options } from 'selenium-webdriver/chrome.js';
import { remote, type Browser } from 'webdriverio';
import { Alumni } from '../src/Alumni.js';
import { AppiumDriver } from '../src/index.js';

let driver: WebDriver | Browser;
let al: Alumni;

const driverType = process.env.ALUMNIUM_DRIVER || 'selenium';

export const mochaHooks = {
  async beforeAll() {
    if (driverType === 'selenium') {
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
        url: process.env.ALUMNIUM_SERVER_URL || 'http://localhost:8013',
      });
    } else if (driverType === 'appium') {
      const capabilities = {
        platformName: 'iOS',
        'appium:automationName': 'XCUITest',
        'appium:bundleId': 'com.apple.mobilesafari',
        'appium:deviceName': 'iPhone 15',
        'appium:platformVersion': '18.4',
        'appium:newCommandTimeout': 300,
        'appium:noReset': true,
      };

      const wdOpts = {
        hostname: process.env.APPIUM_HOST || 'localhost',
        port: parseInt(process.env.APPIUM_PORT || '4723', 10),
        logLevel: 'info' as const,
        capabilities,
      };

      driver = await remote(wdOpts);

      al = new Alumni(driver, {
        url: process.env.ALUMNIUM_SERVER_URL,
      });

      // Set delay on Appium driver
      if (al.driver.constructor.name === 'AppiumDriver') {
        (al.driver as AppiumDriver).delay = 100; // 0.1 seconds
      }
    } else {
      throw new Error(`Driver type '${driverType}' not implemented`);
    }

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
