import { Alumni as BaseAlumni } from "@alumnium/core";
import { XcodeSession } from "./drivers/XcodeSession.ts";
import { XcodeDriver } from "./drivers/XcodeDriver.ts";

/** Alumni driving an `XcodeSession`. */
export class Alumni extends BaseAlumni<XcodeDriver> {
  constructor(driver: XcodeSession, options: Alumni.Options = {}) {
    super(new XcodeDriver(driver), options);
  }

  /** Whether the given object is a native driver this Alumni accepts. */
  static accepts(driver: unknown): driver is Alumni.Driver {
    return driver instanceof XcodeSession;
  }
}

export namespace Alumni {
  export type Driver = XcodeSession;

  export type Options = BaseAlumni.Options;

  export type VisionOptions = BaseAlumni.VisionOptions;

  export type CheckOptions = BaseAlumni.CheckOptions;

  export type CheckAssert = BaseAlumni.CheckAssert;
}
