import type { Locator } from "playwright-core";
import type { WebElement } from "selenium-webdriver";

export type Element = WebElement | Locator | WebdriverIO.Element;

export * from "./AppiumDriver.js";
export * from "./BaseDriver.js";
export * from "./keys.js";
export * from "./PlaywrightDriver.js";
export * from "./SeleniumDriver.js";
