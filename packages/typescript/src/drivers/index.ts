import type { Locator } from "playwright-core";
import type { WebElement } from "selenium-webdriver";

export type Element = WebElement | Locator | WebdriverIO.Element;

export * from "./AppiumDriver.ts";
export * from "./BaseDriver.ts";
export * from "./keys.ts";
export * from "./PlaywrightDriver.ts";
export * from "./SeleniumDriver.ts";
