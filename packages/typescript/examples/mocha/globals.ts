import { type WebDriver } from "selenium-webdriver";
import { type Browser } from "webdriverio";
import { type Alumni } from "../../src/Alumni.js";

declare global {
  var al: Alumni;
  var driver: WebDriver | Browser;
}
