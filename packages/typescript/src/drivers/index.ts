import type { Locator } from "playwright";
import type { WebElement } from "selenium-webdriver";
import type { ChainablePromiseElement } from "webdriverio";

export type Element = WebElement | Locator | ChainablePromiseElement;
