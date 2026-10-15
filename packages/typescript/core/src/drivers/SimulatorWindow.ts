import os from "node:os";
import { Logger } from "../telemetry/Logger.ts";
import { exec } from "../utils/process.ts";

const logger = Logger.get(import.meta.url);

/** Owns a visible Simulator window for an iOS session on macOS. */
export class SimulatorWindow {
  static #sessions = 0;
  #opened = false;

  async open(deviceId: string, headless = false): Promise<void> {
    if (headless || os.platform() !== "darwin" || this.#opened) return;

    try {
      await exec(
        "open",
        ["-a", "Simulator", "--args", "-CurrentDeviceUDID", deviceId],
        { timeout: 10_000 },
      );
      this.#opened = true;
      SimulatorWindow.#sessions++;
    } catch (error) {
      logger.warn(`Could not open Simulator: ${error}`);
    }
  }

  async close(): Promise<void> {
    if (!this.#opened) return;

    this.#opened = false;
    // Keep Simulator visible while another Maestro or Xcode session still uses it.
    if (--SimulatorWindow.#sessions) return;
    try {
      await exec(
        "osascript",
        [
          "-e",
          'if application "Simulator" is running then tell application "Simulator" to quit',
        ],
        { timeout: 10_000 },
      );
    } catch (error) {
      logger.warn(`Could not close Simulator: ${error}`);
    }
  }
}
