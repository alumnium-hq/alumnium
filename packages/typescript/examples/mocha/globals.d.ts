import { WebDriver } from "selenium-webdriver";
import { Alumni } from "../../src/Alumni.js";

declare global {
  var driver: WebDriver;
  var al: Alumni;
}

export {};
