import { Alumni as AppiumAlumni, AppiumDriver } from "@alumnium/appium";
import {
  Alumni as BaseAlumni,
  type BaseDriver,
  Env,
} from "@alumnium/core/internal";
import { Alumni as MaestroAlumni, MaestroDriver } from "@alumnium/maestro";
import {
  Alumni as PlaywrightAlumni,
  PlaywrightDriver,
} from "@alumnium/playwright";
import {
  Alumni as SeleniumAlumni,
  SeleniumDriverFactory,
} from "@alumnium/selenium";
import { Alumni as XcodeAlumni, XcodeDriver } from "@alumnium/xcode";
import type { Element } from "./drivers/index.ts";
import { resolveModel } from "./models.ts";

/**
 * Alumni accepting any supported native driver: Selenium `WebDriver`,
 * Playwright `Page`, WebdriverIO (Appium) `Browser`, `MaestroSession` or
 * `XcodeSession`.
 */
export class Alumni extends BaseAlumni<BaseDriver<Element>> {
  constructor(driver: Alumni.Driver, options: Alumni.Options = {}) {
    super(wrapDriver(driver), {
      ...options,
      //  With `url`, the server picks the model, not the client.
      ...(!options.url && {
        model: resolveModel(options.model ?? Env.ALUMNIUM_MODEL),
      }),
    });
  }
}

export namespace Alumni {
  export type Driver =
    | SeleniumAlumni.Driver
    | PlaywrightAlumni.Driver
    | AppiumAlumni.Driver
    | MaestroAlumni.Driver
    | XcodeAlumni.Driver;

  export type Options = BaseAlumni.Options;

  export type DoOptions = BaseAlumni.DoOptions;

  export type GetOptions = BaseAlumni.GetOptions;

  export type CheckOptions = BaseAlumni.CheckOptions;

  export type CheckAssert = BaseAlumni.CheckAssert;
}

/** Wraps a native driver into the matching Alumnium driver. */
export function wrapDriver(driver: Alumni.Driver): BaseDriver<Element> {
  if (SeleniumAlumni.accepts(driver))
    return SeleniumDriverFactory.create(driver);
  if (PlaywrightAlumni.accepts(driver)) return new PlaywrightDriver(driver);
  if (AppiumAlumni.accepts(driver)) return new AppiumDriver(driver);
  if (MaestroAlumni.accepts(driver)) return new MaestroDriver(driver);
  if (XcodeAlumni.accepts(driver)) return new XcodeDriver(driver);
  throw new Error(`Unsupported driver type '${typeof driver}'`);
}
