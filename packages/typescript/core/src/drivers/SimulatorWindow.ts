import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Logger } from "../telemetry/Logger.ts";
import { exec } from "../utils/process.ts";

const logger = Logger.get(import.meta.url);

/** Owns a visible Simulator window for an iOS session on macOS. */
export class SimulatorWindow {
  static #sessions = 0;
  #opened = false;
  #simulatorApp: string | undefined;

  async open(deviceId: string, headless = false): Promise<void> {
    if (headless || os.platform() !== "darwin" || this.#opened) return;

    try {
      const { stdout } = await exec("xcrun", ["--find", "simctl"]);
      const developerDir = path.resolve(stdout.trim(), "../../..");
      const deviceHub = path.resolve(
        developerDir,
        "../Applications/DeviceHub.app",
      );
      if (existsSync(deviceHub)) {
        await exec(
          "open",
          [
            "-a",
            deviceHub,
            `devices://device/open?id=${encodeURIComponent(deviceId)}`,
          ],
          { timeout: 10_000 },
        );
      } else {
        const simulator = path.join(developerDir, "Applications/Simulator.app");
        await exec(
          "open",
          ["-a", simulator, "--args", "-CurrentDeviceUDID", deviceId],
          { timeout: 10_000 },
        );
        this.#simulatorApp = simulator;
        SimulatorWindow.#sessions++;
      }
      this.#opened = true;
    } catch (error) {
      logger.warn(`Could not open iOS simulator window: ${error}`);
    }
  }

  async close(): Promise<void> {
    if (!this.#opened) return;

    this.#opened = false;
    const simulator = this.#simulatorApp;
    this.#simulatorApp = undefined;
    if (!simulator) return;
    // Keep Simulator visible while another Maestro or Xcode session still uses it.
    if (--SimulatorWindow.#sessions) return;
    try {
      await exec(
        "osascript",
        [
          "-e",
          `if application ${JSON.stringify(simulator)} is running then tell application ${JSON.stringify(simulator)} to quit`,
        ],
        { timeout: 10_000 },
      );
    } catch (error) {
      logger.warn(`Could not close Simulator: ${error}`);
    }
  }
}
