import { z } from "zod";

export namespace Driver {
  export type Platform = z.infer<typeof Driver.Platform>;
}

export abstract class Driver {
  static PLATFORMS = ["chromium", "uiautomator2", "xcuitest"] as const;

  static Platform = z.enum(this.PLATFORMS);
}
