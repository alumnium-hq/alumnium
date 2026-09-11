import { z } from "zod";

export namespace Driver {
  export type ChromiumPlatform = z.infer<typeof Driver.ChromiumPlatform>;

  export type AppiumPlatform = z.infer<typeof Driver.AppiumPlatform>;

  export type AppiumOs = z.infer<typeof Driver.AppiumOs>;

  export type Platform = z.infer<typeof Driver.Platform>;

  export type Kind = z.infer<typeof Driver.Kind>;

  export type Id = z.infer<typeof Driver.Id>;
}

export abstract class Driver {
  static chromiumPlatform = "chromium" as const;

  static chromiumPlatformAliases = [this.chromiumPlatform, "chrome"] as const;

  static ChromiumPlatformAlias = z.enum(this.chromiumPlatformAliases);

  static ChromiumPlatformStrict = z.literal(this.chromiumPlatform);

  static ChromiumPlatform = z.preprocess((val) => {
    // Normalize "chromium" aliases
    const parsedAlias = this.ChromiumPlatformAlias.safeParse(val);
    if (parsedAlias.success) return this.chromiumPlatform;
    return val;
  }, this.ChromiumPlatformStrict);

  static appiumOses = ["android", "ios"] as const;

  static AppiumOs = z.enum(this.appiumOses);

  static appiumPlatforms = ["uiautomator2", "xcuitest"] as const;

  static AppiumPlatformStrict = z.enum(this.appiumPlatforms);

  static AppiumPlatform = z.preprocess((val): unknown => {
    // Normalize Appium OS to platform
    const parsedOs = this.AppiumOs.safeParse(val);
    switch (parsedOs.data) {
      case "android":
        return "uiautomator2";
      case "ios":
        return "xcuitest";
      case undefined:
        return val;
    }
  }, this.AppiumPlatformStrict);

  static maestroPlatform = "maestro" as const;

  static MaestroPlatform = z.literal(this.maestroPlatform);

  static PlatformStrict = z.enum([
    this.chromiumPlatform,
    ...this.appiumPlatforms,
    this.maestroPlatform,
  ]);

  static Platform = z.preprocess((val) => {
    const parsedChromium = this.ChromiumPlatform.safeParse(val);
    if (parsedChromium.success) return parsedChromium.data;

    const parsedAppium = this.AppiumPlatform.safeParse(val);
    if (parsedAppium.success) return parsedAppium.data;

    return val;
  }, this.PlatformStrict);

  static chromiumKinds = ["selenium", "playwright"] as const;

  static ChromiumKind = z.enum(this.chromiumKinds);

  static appiumKind = "appium" as const;

  static AppiumKind = z.literal(this.appiumKind);

  static maestroKind = "maestro" as const;

  static MaestroKind = z.literal(this.maestroKind);

  static kinds = [
    ...this.chromiumKinds,
    this.appiumKind,
    this.maestroKind,
  ] as const;

  static Kind = z.enum(this.kinds).default("selenium");

  static Id = z
    .union([
      this.ChromiumKind,
      this.MaestroKind,
      z.templateLiteral([this.AppiumKind, "-", this.AppiumOs]),
    ])
    .default("selenium");

  static isAppium(kind: Driver.Id): boolean {
    return kind.startsWith("appium");
  }

  static isMaestro(kind: Driver.Id): boolean {
    return kind === this.maestroKind;
  }

  static isMobile(kind: Driver.Id): boolean {
    return this.isAppium(kind) || this.isMaestro(kind);
  }
}
