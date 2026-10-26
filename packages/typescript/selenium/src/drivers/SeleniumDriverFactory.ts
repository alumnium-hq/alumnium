import type { WebDriver } from "selenium-webdriver";
import { Driver as FirefoxWebDriver } from "selenium-webdriver/firefox.js";
import { BiDiDriver } from "./BiDiDriver.ts";
import { CdpDriver } from "./CdpDriver.ts";

/** Creates the Alumnium driver for the browser a Selenium `WebDriver` drives. */
export abstract class SeleniumDriverFactory {
  /**
   * Returns `BiDiDriver` for Firefox and `CdpDriver` for Chromium browsers.
   */
  static create(driver: WebDriver): CdpDriver | BiDiDriver {
    return driver instanceof FirefoxWebDriver
      ? new BiDiDriver(driver)
      : new CdpDriver(driver);
  }
}
