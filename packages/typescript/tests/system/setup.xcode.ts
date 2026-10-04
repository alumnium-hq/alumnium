import path from "node:path";
import type { TestProject } from "vitest/node";
import { z } from "zod";
import { exec } from "../../src/utils/process.ts";

const DEVICES = z.object({
  devices: z.record(
    z.string(),
    z.array(
      z.object({
        udid: z.string(),
        name: z.string(),
        state: z.string(),
        isAvailable: z.boolean(),
      }),
    ),
  ),
});

declare module "vitest" {
  export interface ProvidedContext {
    xcodeAppPath: string;
    xcodeAppId: string;
    xcodeDeviceId: string;
  }
}

export async function setup(project: TestProject) {
  const appPath = path.resolve(
    "../python/examples/behave/features/support/TodoList.app",
  );
  const { stdout: bundleId } = await exec("/usr/libexec/PlistBuddy", [
    "-c",
    "Print :CFBundleIdentifier",
    path.join(appPath, "Info.plist"),
  ]);
  const { stdout } = await exec("xcrun", [
    "simctl",
    "list",
    "devices",
    "available",
    "--json",
  ]);

  // Check for iOS 27+ simulators
  const devices = Object.entries(DEVICES.parse(JSON.parse(stdout)).devices)
    .filter(([runtime]) => {
      const version = /\.iOS-(\d+)/.exec(runtime)?.[1];
      return version && Number(version) >= 27;
    })
    .flatMap(([, devices]) => devices);

  const device =
    devices.find((device) => device.state === "Booted") ||
    devices.find((device) => device.name.startsWith("iPhone"));

  if (!device) throw new Error("No matching iOS 27+ simulator found");

  // Boot the simulator if needed
  if (device.state !== "Booted") {
    await exec("xcrun", ["simctl", "boot", device.udid]);
    await exec("xcrun", ["simctl", "bootstatus", device.udid, "-b"], {
      timeout: 300_000,
    });
  }

  console.log(`Testing ${bundleId.trim()} on ${device.name} (${device.udid})`);
  project.provide("xcodeAppPath", appPath);
  project.provide("xcodeAppId", bundleId.trim());
  project.provide("xcodeDeviceId", device.udid);
}
