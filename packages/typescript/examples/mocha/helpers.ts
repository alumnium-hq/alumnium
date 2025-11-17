import { Locator } from "playwright";
import { Builder, WebDriver, WebElement } from "selenium-webdriver";
import { Options } from "selenium-webdriver/chrome.js";
import { ChainablePromiseElement, type Browser } from "webdriverio";
import { Alumni } from "../../src/Alumni.js";
import { type Element } from "../../src/drivers/index.js";
import { AppiumDriver } from "../../src/index.js";

let driver: WebDriver | Browser;
let al: Alumni;

const driverType = process.env.ALUMNIUM_DRIVER || "selenium";

export const mochaHooks = {
  async beforeAll() {
    if (driverType === "selenium") {
      const options = new Options();
      options.addArguments("--disable-blink-features=AutomationControlled");
      options.setUserPreferences({
        credentials_enable_service: false,
        profile: {
          password_manager_enabled: false,
          password_manager_leak_detection: false,
        },
      });

      driver = await new Builder()
        .forBrowser("chrome")
        .setChromeOptions(options)
        .build();

      al = new Alumni(driver, {
        url: process.env.ALUMNIUM_SERVER_URL || "http://localhost:8013",
      });
    } else if (driverType === "appium") {
      const { browser } = await import("@wdio/globals");
      driver = browser as Browser;
      al = new Alumni(driver, {
        url: process.env.ALUMNIUM_SERVER_URL || "http://localhost:8013",
      });
      (al.driver as AppiumDriver).delay = 0.1;
    } else {
      throw new Error(`Driver type '${driverType}' not implemented`);
    }

    // Make available globally
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    (global as any).driver = driver;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    (global as any).al = al;
  },

  async afterEach(this: Mocha.Context) {
    if (this.currentTest?.state === "failed") {
      await al.cache.discard();
    } else {
      await al.cache.save();
    }
  },

  async afterAll() {
    if (driverType === "selenium") {
      await (driver as WebDriver).quit();
    }
    await al.quit();
  },
};

export function navigate(driver: WebDriver | Browser, url: string) {
  if (driverType === "appium") {
    return (driver as Browser).url(url);
  } else if (driverType === "selenium") {
    return (driver as WebDriver).get(url);
  } else {
    throw new Error(`Driver type '${typeof driver}' not implemented`);
  }
}

export function type(element: Element, text: string) {
  if (driverType === "appium") {
    return (element as ChainablePromiseElement).setValue(text);
  } else if (driverType === "selenium") {
    return (element as WebElement).sendKeys(text);
  } else if (driverType === "playwright") {
    return (element as Locator).fill(text);
  } else {
    throw new Error(`Driver type '${typeof driver}' not implemented`);
  }
}
