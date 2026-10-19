import { Alumni as BaseAlumni } from "@alumnium/core";
import { MaestroDriver } from "./drivers/MaestroDriver.ts";
import { MaestroSession } from "./drivers/MaestroSession.ts";

/** Alumni driving a `MaestroSession`. */
export class Alumni extends BaseAlumni<MaestroDriver> {
  constructor(driver: MaestroSession, options: Alumni.Options = {}) {
    super(new MaestroDriver(driver), options);
  }

  /** Whether the given object is a native driver this Alumni accepts. */
  static accepts(driver: unknown): driver is Alumni.Driver {
    return driver instanceof MaestroSession;
  }
}

export namespace Alumni {
  export type Driver = MaestroSession;

  export type Options = BaseAlumni.Options;

  export type DoOptions = BaseAlumni.DoOptions;

  export type GetOptions = BaseAlumni.GetOptions;

  export type CheckOptions = BaseAlumni.CheckOptions;

  export type CheckAssert = BaseAlumni.CheckAssert;
}
