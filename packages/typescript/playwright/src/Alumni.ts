import type { Page } from "playwright-core";
import { Alumni as BaseAlumni } from "@alumnium/core";
import { PlaywrightDriver } from "./drivers/PlaywrightDriver.ts";

/** Alumni driving a Playwright `Page`. */
export class Alumni extends BaseAlumni<PlaywrightDriver> {
  constructor(driver: Page, options: Alumni.Options = {}) {
    super(new PlaywrightDriver(driver), options);
  }

  /** Whether the given object is a native driver this Alumni accepts. */
  static accepts(driver: unknown): driver is Alumni.Driver {
    return !!driver && typeof (driver as Page).context === "function";
  }
}

export namespace Alumni {
  export type Driver = Page;

  export type Options = BaseAlumni.Options;

  export type VisionOptions = BaseAlumni.VisionOptions;

  export type CheckOptions = BaseAlumni.CheckOptions;

  export type CheckAssert = BaseAlumni.CheckAssert;
}
