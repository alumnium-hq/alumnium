import { WebDriver } from "selenium-webdriver";
import { Alumni as BaseAlumni } from "@alumnium/core";
import type { SeleniumDriver } from "./drivers/SeleniumDriver.ts";
import { SeleniumDriverFactory } from "./drivers/SeleniumDriverFactory.ts";

/** Alumni driving a Selenium `WebDriver`. */
export class Alumni extends BaseAlumni<SeleniumDriver> {
  constructor(driver: WebDriver, options: Alumni.Options = {}) {
    super(SeleniumDriverFactory.create(driver), options);
  }

  /** Whether the given object is a native driver this Alumni accepts. */
  static accepts(driver: unknown): driver is Alumni.Driver {
    return driver instanceof WebDriver;
  }
}

export namespace Alumni {
  export type Driver = WebDriver;

  export type Options = BaseAlumni.Options;

  export type DoOptions = BaseAlumni.DoOptions;

  export type GetOptions = BaseAlumni.GetOptions;

  export type CheckOptions = BaseAlumni.CheckOptions;

  export type CheckAssert = BaseAlumni.CheckAssert;
}
