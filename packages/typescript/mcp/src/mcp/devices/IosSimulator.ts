import { existsSync } from "node:fs";
import path from "node:path";
import z from "zod";
import { exec } from "@alumnium/core/internal";
import type { McpDriver } from "../mcpDrivers.ts";
import type { MobileDevice } from "./MobileDevice.ts";

const devicesSchema = z.object({
  devices: z.record(
    z.string(),
    z.array(
      z.object({
        udid: z.string(),
        name: z.string(),
        deviceTypeIdentifier: z.string(),
      }),
    ),
  ),
});

export class IosSimulator implements MobileDevice {
  readonly #name: string;
  readonly #location: { latitude: number; longitude: number } | undefined;
  #device = "";
  #closing: Promise<void> | undefined;

  constructor(
    name: string,
    location?: { latitude: number; longitude: number },
  ) {
    this.#name = name;
    this.#location = location;
  }

  async prepare(
    options: McpDriver.MobileOptions,
  ): Promise<McpDriver.MobileOptions> {
    if (!options.device)
      throw new Error(
        "Creating an iOS simulator requires a device name or UDID to use as a template",
      );
    const result = await exec("xcrun", [
      "simctl",
      "list",
      "devices",
      "available",
      "--json",
    ]);
    const { devices } = devicesSchema.parse(JSON.parse(result.stdout));
    const matches = Object.entries(devices)
      .flatMap(([runtime, entries]) =>
        entries.map((device) => ({ runtime, ...device })),
      )
      .filter(
        (device) =>
          device.udid.toLowerCase() === options.device?.toLowerCase() ||
          device.name === options.device,
      );
    const [template, ...others] = matches;
    if (!template || others.length)
      throw new Error(
        "The simulator template is unavailable or ambiguous; select an available simulator by UDID",
      );
    const created = await exec("xcrun", [
      "simctl",
      "create",
      `Alumnium-${this.#name}`,
      template.deviceTypeIdentifier,
      template.runtime,
    ]);
    this.#device = created.stdout.trim();
    await exec("xcrun", ["simctl", "boot", this.#device]);
    await exec("xcrun", ["simctl", "bootstatus", this.#device, "-b"]);
    if (this.#location) {
      const { latitude, longitude } = this.#location;
      await exec("xcrun", [
        "simctl",
        "location",
        this.#device,
        "set",
        `${latitude},${longitude}`,
      ]);
    }
    let app = options.app;
    if (app && /\.app[\\/]?$/.test(app) && existsSync(app)) {
      const appPath = path.resolve(app);
      const bundle = await exec("/usr/libexec/PlistBuddy", [
        "-c",
        "Print :CFBundleIdentifier",
        path.join(appPath, "Info.plist"),
      ]);
      await exec("xcrun", ["simctl", "install", this.#device, appPath]);
      app = bundle.stdout.trim();
    }
    return {
      ...options,
      device: this.#device,
      app,
      ...(app !== options.app && { appReset: false }),
    };
  }

  close(): Promise<void> {
    this.#closing ??= this.#close();
    return this.#closing;
  }

  async #close(): Promise<void> {
    if (!this.#device) return;
    await exec("xcrun", ["simctl", "shutdown", this.#device]).catch(() => {});
    await exec("xcrun", ["simctl", "delete", this.#device]);
    this.#device = "";
  }
}
