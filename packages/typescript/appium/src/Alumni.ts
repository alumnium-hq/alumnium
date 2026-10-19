import type { Browser } from "webdriverio";
import { Alumni as BaseAlumni } from "@alumnium/core";
import { AppiumDriver } from "./drivers/AppiumDriver.ts";

/** Alumni driving a WebdriverIO (Appium) `Browser`. */
export class Alumni extends BaseAlumni<AppiumDriver> {
  constructor(driver: Browser, options: Alumni.Options = {}) {
    super(new AppiumDriver(driver), options);
  }

  /** Whether the given object is a native driver this Alumni accepts. */
  static accepts(driver: unknown): driver is Alumni.Driver {
    return (
      !!driver &&
      !!(driver as Browser).capabilities &&
      typeof (driver as Browser).getPageSource === "function"
    );
  }
}

export namespace Alumni {
  export type Driver = Browser;

  export type Options = BaseAlumni.Options;

  export type DoOptions = BaseAlumni.DoOptions;

  export type GetOptions = BaseAlumni.GetOptions;

  export type CheckOptions = BaseAlumni.CheckOptions;

  export type CheckAssert = BaseAlumni.CheckAssert;
}
