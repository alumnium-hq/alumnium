import type { Locator } from "playwright";
import type { WebElement } from "selenium-webdriver";

export type Element = WebElement | Locator | WebdriverIO.Element;
