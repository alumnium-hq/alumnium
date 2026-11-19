import { existsSync } from "node:fs";
import path from "node:path";
import { exec } from "@alumnium/core/internal";
import type { McpDriver } from "../mcpDrivers.ts";
import { resolveIosSimulatorProfile } from "./iosSimulatorProfile.ts";
import type { MobileDevice } from "./MobileDevice.ts";

export class IosSimulator implements MobileDevice {
  readonly #name: string;
  readonly #location: { latitude: number; longitude: number } | undefined;
  #device = "";
  #closing: Promise<void> | undefined;
  #preparing: Promise<McpDriver.MobileOptions> | undefined;
  readonly #preparation = new AbortController();

  constructor(
    name: string,
    location?: { latitude: number; longitude: number },
  ) {
    this.#name = name;
    this.#location = location;
  }

  prepare(options: McpDriver.MobileOptions): Promise<McpDriver.MobileOptions> {
    this.#preparing = this.#prepare(options);
    return this.#preparing;
  }

  async #prepare(
    options: McpDriver.MobileOptions,
  ): Promise<McpDriver.MobileOptions> {
    const signal = this.#preparation.signal;
    signal.throwIfAborted();
    const profile = await resolveIosSimulatorProfile(options.device, signal);
    signal.throwIfAborted();
    const created = await exec("xcrun", [
      "simctl",
      "create",
      `Alumnium-${this.#name}`,
      profile.deviceType,
      profile.runtime,
    ]);
    this.#device = created.stdout.trim();
    signal.throwIfAborted();
    const commandOptions = { signal, killSignal: "SIGKILL" as const };
    await exec("xcrun", ["simctl", "boot", this.#device], commandOptions);
    await exec(
      "xcrun",
      ["simctl", "bootstatus", this.#device, "-b"],
      commandOptions,
    );
    if (this.#location) {
      const { latitude, longitude } = this.#location;
      await exec(
        "xcrun",
        ["simctl", "location", this.#device, "set", `${latitude},${longitude}`],
        commandOptions,
      );
    }
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
        ["simctl", "install", this.#device, appPath],
        commandOptions,
      );
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
    this.#preparation.abort();
    await this.#preparing?.catch(() => {});
    if (!this.#device) return;
    await exec("xcrun", ["simctl", "delete", this.#device]);
    this.#device = "";
  }
}
