import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { TestProject } from "vitest/node";
import { Env } from "../../src/Env.ts";

const execFileAsync = promisify(execFile);

/** Runs a tool with a hard timeout: vitest's global setup has none, so a stuck one hangs the job. */
const exec = (command: string, args: string[], timeoutMs = 120_000) =>
  execFileAsync(command, args, { timeout: timeoutMs });

const SUPPORT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../python/examples/behave/features/support",
);

const APPS = {
  ios: {
    path: path.join(SUPPORT_DIR, "TodoList.app"),
    id: "com.ayodeji.TodoList",
  },
  android: {
    path: path.join(SUPPORT_DIR, "TodoList.apk"),
    id: "com.example.android.architecture.blueprints.main",
  },
} as const;

export type MaestroOs = keyof typeof APPS;

declare module "vitest" {
  export interface ProvidedContext {
    maestroOs: MaestroOs;
    maestroAppId: string;
    maestroDeviceId: string;
  }
}

export async function setup(project: TestProject) {
  const os = Env.ALUMNIUM_MAESTRO_OS;
  const app = APPS[os];

  const deviceId =
    os === "android" ? await bootedEmulator() : await bootedSimulator();

  console.log(`Installing ${app.id} on ${os} device ${deviceId}`);
  if (os === "android") {
    await exec(adb(), ["-s", deviceId, "install", "-r", app.path]);
  } else {
    // `simctl boot` brings the device up headlessly. Open the Simulator window too, so a run can
    // be watched rather than just inferred from the log.
    await showSimulator();
    await exec("xcrun", ["simctl", "install", deviceId, app.path]);
  }

  project.provide("maestroOs", os);
  project.provide("maestroAppId", app.id);
  project.provide("maestroDeviceId", deviceId);
}

//#region Android

/** `adb` from the SDK named by the environment, falling back to whatever is on PATH. */
function adb(): string {
  const sdk = Env.ANDROID_HOME ?? Env.ANDROID_SDK_ROOT;
  return sdk ? path.join(sdk, "platform-tools", "adb") : "adb";
}

/** Returns the serial of a running emulator; booting one is left to the developer. */
async function bootedEmulator(): Promise<string> {
  const { stdout } = await exec(adb(), ["devices"]);
  const serial = stdout
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .find(([, state]) => state === "device")?.[0];
  if (!serial) {
    throw new Error(
      "No running Android emulator found. Start one first, e.g. `emulator @<avd>` or `maestro start-device --platform android`.",
    );
  }
  return serial;
}

//#endregion

//#region iOS

/** Returns an already-booted simulator, booting the newest available iPhone if there is none. */
async function bootedSimulator(): Promise<string> {
  const booted = await listSimulators("booted");
  const alreadyBooted = booted.find((device) =>
    device.name.startsWith("iPhone"),
  );
  if (alreadyBooted) return alreadyBooted.udid;

  const available = await listSimulators("available");
  const candidate = available.find((device) =>
    device.name.startsWith("iPhone"),
  );
  if (!candidate) {
    throw new Error(
      "No iPhone simulator available. Install an iOS runtime through Xcode.",
    );
  }

  console.log(`Booting simulator ${candidate.name} (${candidate.udid})`);
  await exec("xcrun", ["simctl", "boot", candidate.udid]);
  // `boot` returns as soon as the device starts coming up; installing into it before it has
  // finished booting can stall, so wait for the boot to complete.
  await exec("xcrun", ["simctl", "bootstatus", candidate.udid, "-b"], 300_000);
  return candidate.udid;
}

/** Brings the Simulator window to the front. Failing to do so must not fail the run. */
async function showSimulator(): Promise<void> {
  try {
    await exec("open", ["-a", "Simulator"]);
  } catch (error) {
    console.warn(`Could not open the Simulator window: ${error}`);
  }
}

interface SimctlDevice {
  udid: string;
  name: string;
  state: string;
  isAvailable?: boolean;
}

async function listSimulators(
  filter: "booted" | "available",
): Promise<SimctlDevice[]> {
  const { stdout } = await exec("xcrun", [
    "simctl",
    "list",
    "devices",
    filter,
    "--json",
  ]);
  const parsed = JSON.parse(stdout) as {
    devices: Record<string, SimctlDevice[]>;
  };
  // Newest runtimes sort last in simctl's output, so reverse to prefer them.
  return Object.entries(parsed.devices)
    .reverse()
    .flatMap(([, devices]) => devices);
}

//#endregion
