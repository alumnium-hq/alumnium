import { type Alumni } from "alumnium";
import { type WebDriver } from "selenium-webdriver";
import { type Browser } from "webdriverio";

declare global {
  var al: Alumni;
  var driver: WebDriver | Browser;
}
