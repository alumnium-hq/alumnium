import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { TestProject } from "vitest/node";

const exec = promisify(execFile);

const APP_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../python/examples/behave/features/support/TodoList.app",
);
const APP_ID = "com.ayodeji.TodoList";

declare module "vitest" {
  export interface ProvidedContext {
    maestroAppId: string;
    maestroDeviceId: string;
  }
}

export async function setup(project: TestProject) {
  const deviceId = await bootedDevice();

  // `simctl boot` brings the device up headlessly. Open the Simulator window too, so a run can be
  // watched rather than just inferred from the log.
  await showSimulator();

  console.log(`Installing ${APP_ID} on simulator ${deviceId}`);
  await exec("xcrun", ["simctl", "install", deviceId, APP_PATH]);

  project.provide("maestroAppId", APP_ID);
  project.provide("maestroDeviceId", deviceId);
}

/** Returns an already-booted simulator, booting the newest available iPhone if there is none. */
async function bootedDevice(): Promise<string> {
  const booted = await listDevices("booted");
  const alreadyBooted = booted.find((device) =>
    device.name.startsWith("iPhone"),
  );
  if (alreadyBooted) return alreadyBooted.udid;

  const available = await listDevices("available");
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

async function listDevices(
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
  return Object.entries(parsed.devices)
    .reverse()
    .flatMap(([, devices]) => devices);
}
