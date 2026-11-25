import { existsSync } from "node:fs";
import path from "node:path";
import { exec } from "@alumnium/core/internal";
import type { McpDriver } from "../mcpDrivers.ts";
import {
  findIosSimulator,
  resolveIosSimulatorProfile,
} from "./iosSimulatorProfile.ts";
import type { MobileDevice } from "./MobileDevice.ts";

export class IosSimulator implements MobileDevice {
  #closing: Promise<void> | undefined;
  #preparing: Promise<McpDriver.MobileOptions> | undefined;
  readonly #preparation = new AbortController();

  prepare(options: McpDriver.MobileOptions): Promise<McpDriver.MobileOptions> {
    this.#preparing = this.#prepare(options);
    return this.#preparing;
  }

  async #prepare(
    options: McpDriver.MobileOptions,
  ): Promise<McpDriver.MobileOptions> {
    const signal = this.#preparation.signal;
    const commandOptions = { signal, killSignal: "SIGKILL" as const };
    const existing = await findIosSimulator(options.device, signal);
    let device = existing?.udid;
    if (!device) {
      const profile = await resolveIosSimulatorProfile(options.device, signal);
      const created = await exec(
        "xcrun",
        ["simctl", "create", profile.name, profile.deviceType, profile.runtime],
        commandOptions,
      );
      device = created.stdout.trim();
    }
    if (existing?.state !== "Booted")
      await exec("xcrun", ["simctl", "boot", device], commandOptions);
    await exec("xcrun", ["simctl", "bootstatus", device, "-b"], commandOptions);
    let app = options.app;
    if (app && /\.app[\\/]?$/.test(app) && existsSync(app)) {
      const appPath = path.resolve(app);
      const bundle = await exec(
        "/usr/libexec/PlistBuddy",
        ["-c", "Print :CFBundleIdentifier", path.join(appPath, "Info.plist")],
        commandOptions,
      );
      await exec(
        "xcrun",
        ["simctl", "install", device, appPath],
        commandOptions,
      );
      app = bundle.stdout.trim();
    }
    return {
      ...options,
      device,
      app,
    };
  }

  close(): Promise<void> {
    this.#closing ??= this.#close();
    return this.#closing;
  }

  async #close(): Promise<void> {
    this.#preparation.abort();
    await this.#preparing?.catch(() => {});
  }
}
