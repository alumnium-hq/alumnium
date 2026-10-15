import { Alumni as BaseAlumni } from "@alumnium/core";
import { WebDriver } from "selenium-webdriver";
import { SeleniumDriver } from "./drivers/SeleniumDriver.ts";

/** Alumni driving a Selenium `WebDriver`. */
export class Alumni extends BaseAlumni<SeleniumDriver> {
  constructor(driver: WebDriver, options: Alumni.Options = {}) {
    super(new SeleniumDriver(driver), options);
  }

  /** Whether the given object is a native driver this Alumni accepts. */
  static accepts(driver: unknown): driver is Alumni.Driver {
    return driver instanceof WebDriver;
  }
}

export namespace Alumni {
  export type Driver = WebDriver;

  export type Options = BaseAlumni.Options;

  export type VisionOptions = BaseAlumni.VisionOptions;

  export type CheckOptions = BaseAlumni.CheckOptions;

  export type CheckAssert = BaseAlumni.CheckAssert;
}
