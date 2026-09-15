import { z } from "zod";

export namespace Driver {
  export type ChromiumPlatform = z.infer<typeof Driver.ChromiumPlatform>;

  export type MobileOs = z.infer<typeof Driver.MobileOs>;

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

  static mobileOses = ["android", "ios"] as const;

  static MobileOs = z.enum(this.mobileOses);

  static platforms = [this.chromiumPlatform, ...this.mobileOses] as const;

  static PlatformStrict = z.enum(this.platforms);

  static Platform = z.preprocess((val) => {
    const parsedChromium = this.ChromiumPlatform.safeParse(val);
    return parsedChromium.success ? parsedChromium.data : val;
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

  static Kind = z.enum(this.kinds);

  static Id = z
    .union([
      this.ChromiumKind,
      this.MaestroKind,
      z.templateLiteral([this.AppiumKind, "-", this.MobileOs]),
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
