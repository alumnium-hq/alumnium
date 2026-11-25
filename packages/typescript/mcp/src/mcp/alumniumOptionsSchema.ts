import z from "zod";

export const alumniumOptionsSchema = z.looseObject({
  app: z.string().optional(),
  appArguments: z.array(z.string()).optional(),
  appEnvironment: z.record(z.string(), z.string()).optional(),
  appReset: z.boolean().optional(),
  autoswitchContexts: z.boolean().optional(),
  autoswitchToNewTab: z.boolean().optional(),
  baseUrl: z.string().optional(),
  changeAnalysis: z.boolean().optional(),
  cookies: z
    .array(
      z.looseObject({
        name: z.string(),
        value: z.string(),
        url: z.string().optional(),
        domain: z.string().optional(),
        path: z.string().optional(),
        expires: z.number().optional(),
        httpOnly: z.boolean().optional(),
        secure: z.boolean().optional(),
        sameSite: z.enum(["Strict", "Lax", "None"]).optional(),
        partitionKey: z.string().optional(),
      }),
    )
    .optional(),
  delay: z.number().optional(),
  /**
   * Parses `alumnium:options.device` into either a device name/identifier (string) or a Playwright
   * device-descriptor object (e.g. pasted directly from Playwright's own device list). A string is
   * a Playwright catalog name for browsers and a device name, UDID or serial for mobile drivers.
   * Field-level validation of the object form happens downstream in `resolveDeviceOptions`.
   */
  device: z
    .union([
      z.string(),
      z.object({
        deviceScaleFactor: z.number().optional(),
        hasTouch: z.boolean().optional(),
        isMobile: z.boolean().optional(),
        userAgent: z.string().optional(),
        viewport: z
          .object({ width: z.number(), height: z.number() })
          .optional(),
      }),
    ])
    .optional(),
  disabledTools: z.array(z.string()).optional(),
  doubleFetchPageSource: z.boolean().optional(),
  excludeAttributes: z.array(z.string()).optional(),
  executablePath: z.string().optional(),
  fullPageScreenshot: z.boolean().optional(),
  geolocation: z
    .tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)])
    .optional(),
  headers: z
    .record(z.string(), z.union([z.string(), z.record(z.string(), z.string())]))
    .optional(),
  headless: z.boolean().optional(),
  hideKeyboardAfterTyping: z.boolean().optional(),
  /**
   * Parses `alumnium:options.navigationPolicy` into `NavigationPolicy.Options`, keeping only the
   * domain fields without `allowedFilePaths`.
   */
  navigationPolicy: z
    .object({
      allowedDomains: z.array(z.string()).optional(),
      deniedDomains: z.array(z.string()).optional(),
    })
    .optional(),
  newTabTimeout: z.number().optional(),
  permissions: z.array(z.string()).optional(),
  planner: z.boolean().optional(),
  profile: z.string().optional(),
  proxy: z
    .object({
      server: z.string(),
      bypass: z.string().optional(),
      username: z.string().optional(),
      password: z.string().optional(),
    })
    .optional(),
  recordVideos: z.boolean().optional(),
  userAgent: z.string().optional(),
});
