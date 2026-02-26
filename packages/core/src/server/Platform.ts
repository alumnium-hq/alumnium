import z from "zod";

export const PLATFORMS = ["chromium", "uiautomator2", "xcuitest"] as const;

export const Platform = z.enum(PLATFORMS);

export type Platform = z.infer<typeof Platform>;
