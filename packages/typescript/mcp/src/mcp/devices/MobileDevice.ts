import z from "zod";
import type { McpDriver } from "../mcpDrivers.ts";
import { IosSimulator } from "./IosSimulator.ts";

export interface MobileDevice {
  prepare(options: McpDriver.MobileOptions): Promise<McpDriver.MobileOptions>;
  close(): Promise<void>;
}

export const deviceOptionsSchema = z.object({
  deviceLifecycle: z.enum(["reuse", "create"]).default("reuse"),
  deviceLocation: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .optional(),
});

export function createMobileDevice(
  platform: string,
  options: Record<string, unknown>,
  id: string,
): MobileDevice | undefined {
  const { deviceLifecycle, deviceLocation } =
    deviceOptionsSchema.parse(options);
  if (deviceLifecycle === "reuse") {
    if (deviceLocation)
      throw new Error("deviceLocation requires deviceLifecycle: create");
    return;
  }
  switch (platform) {
    case "ios":
      return new IosSimulator(id, deviceLocation);
    default:
      throw new Error(
        `Creating a temporary ${platform} device is not supported`,
      );
  }
}
