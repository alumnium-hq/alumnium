import type { AppiumDriver } from "@alumnium/appium";
import type { BaseDriver } from "@alumnium/core/internal";
import type { PlaywrightDriver } from "@alumnium/playwright";
import type { SeleniumDriver } from "@alumnium/selenium";

/** Native element handles of the drivers supporting `Alumni.find()`. */
export type Element =
  | BaseDriver.ElementOf<SeleniumDriver>
  | BaseDriver.ElementOf<PlaywrightDriver>
  | BaseDriver.ElementOf<AppiumDriver>;

export { AppiumDriver } from "@alumnium/appium";
export { BaseDriver, Keys } from "@alumnium/core/internal";
export { MaestroDriver, MaestroSession } from "@alumnium/maestro";
export { PlaywrightDriver } from "@alumnium/playwright";
export { BiDiDriver, CdpDriver } from "@alumnium/selenium";
export { XcodeDriver, XcodeSession } from "@alumnium/xcode";
