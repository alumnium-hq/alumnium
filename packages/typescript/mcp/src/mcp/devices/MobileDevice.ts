import { Env } from "@alumnium/core/internal";
import type { McpDriver } from "../mcpDrivers.ts";
import { IosSimulator } from "./IosSimulator.ts";

export interface MobileDevice {
  prepare(options: McpDriver.MobileOptions): Promise<McpDriver.MobileOptions>;
  close(): Promise<void>;
}

export function createMobileDevice(platform: string): MobileDevice | undefined {
  if (
    platform === "ios" &&
    (Env.ALUMNIUM_DRIVER === "maestro" || Env.ALUMNIUM_DRIVER === "xcode")
  )
    return new IosSimulator();
}
