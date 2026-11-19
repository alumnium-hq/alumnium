import { spawn } from "node:child_process";
import z from "zod";
import { exec, Logger } from "@alumnium/core/internal";

const logger = Logger.get(import.meta.url);

const devicesSchema = z.object({
  devices: z
    .record(
      z.string(),
      z.array(
        z.object({
          udid: z.string(),
          name: z.string(),
          deviceTypeIdentifier: z.string(),
          isAvailable: z.boolean().optional(),
        }),
      ),
    )
    .default({}),
});

const catalogSchema = z.object({
  devicetypes: z
    .array(
      z.object({
        identifier: z.string(),
        name: z.string(),
        minRuntimeVersion: z.number(),
        maxRuntimeVersion: z.number(),
      }),
    )
    .default([]),
  runtimes: z
    .array(
      z.object({
        identifier: z.string(),
        version: z.string(),
        isAvailable: z.boolean(),
        supportedDeviceTypes: z
          .array(z.object({ identifier: z.string() }))
          .optional(),
      }),
    )
    .default([]),
});

type Catalog = z.infer<typeof catalogSchema>;
let installation:
  | {
      promise: Promise<void>;
      controller: AbortController;
      waiters: number;
    }
  | undefined;

export async function resolveIosSimulatorProfile(
  device?: string,
  signal?: AbortSignal,
): Promise<{
  deviceType: string;
  runtime: string;
}> {
  signal?.throwIfAborted();
  const commandOptions = { signal, killSignal: "SIGKILL" as const };
  if (device) {
    const result = await exec(
      "xcrun",
      ["simctl", "list", "devices", "available", "--json"],
      commandOptions,
    );
    const { devices } = devicesSchema.parse(JSON.parse(result.stdout));
    const matches = Object.entries(devices)
      .flatMap(([runtime, entries]) =>
        entries.map((entry) => ({ runtime, ...entry })),
      )
      .filter(
        (entry) =>
          entry.isAvailable !== false &&
          (entry.udid.toLowerCase() === device.toLowerCase() ||
            entry.name === device),
      );
    const [template, ...others] = matches;
    if (!template || others.length)
      throw new Error(
        "The simulator template is unavailable or ambiguous; select an available simulator by UDID or omit device to create one automatically",
      );
    return {
      deviceType: template.deviceTypeIdentifier,
      runtime: template.runtime,
    };
  }

  let version: string;
  try {
    version = (
      await exec(
        "xcrun",
        ["--sdk", "iphonesimulator", "--show-sdk-version"],
        commandOptions,
      )
    ).stdout.trim();
  } catch (error) {
    signal?.throwIfAborted();
    throw new Error(
      `iOS simulators require Xcode with iOS support. Install Xcode, complete its first-launch setup, and select it in Xcode Settings > Locations: ${error}`,
      { cause: error },
    );
  }
  let catalog = await readCatalog(signal);
  if (!catalog.devicetypes.some(isDefaultDevice))
    throw new Error(
      "Xcode has no iPhone device profiles. Complete Xcode's first-launch setup before creating a simulator",
    );
  let profile = findProfile(catalog, version);
  if (!profile) {
    await installRuntime(version, signal);
    catalog = await readCatalog(signal);
    profile = findProfile(catalog, version);
  }
  signal?.throwIfAborted();
  if (!profile)
    throw new Error(
      `No compatible iPhone simulator is available for iOS ${version} after runtime installation. Check the iOS runtime in Xcode Settings > Components`,
    );
  return profile;
}

async function readCatalog(signal?: AbortSignal): Promise<Catalog> {
  const result = await exec("xcrun", ["simctl", "list", "--json"], {
    signal,
    killSignal: "SIGKILL",
  });
  return catalogSchema.parse(JSON.parse(result.stdout));
}

function findProfile(catalog: Catalog, version: string) {
  const runtimes = catalog.runtimes
    .filter(
      (runtime) =>
        runtime.isAvailable &&
        runtime.identifier.startsWith(
          "com.apple.CoreSimulator.SimRuntime.iOS-",
        ) &&
        runtime.version.split(".").slice(0, 2).join(".") ===
          version.split(".").slice(0, 2).join("."),
    )
    .sort(
      (a, b) =>
        b.version.localeCompare(a.version, "en", { numeric: true }) ||
        a.identifier.localeCompare(b.identifier),
    );
  const types = catalog.devicetypes
    .filter(isDefaultDevice)
    .sort(
      (a, b) =>
        b.minRuntimeVersion - a.minRuntimeVersion ||
        a.name.localeCompare(b.name, "en", { numeric: true }) ||
        a.identifier.localeCompare(b.identifier),
    );
  for (const runtime of runtimes) {
    const [major = 0, minor = 0, patch = 0] = runtime.version
      .split(".")
      .map(Number);
    const encodedVersion = major * 65536 + minor * 256 + patch;
    const deviceType = types.find(
      (type) =>
        type.minRuntimeVersion <= encodedVersion &&
        type.maxRuntimeVersion >= encodedVersion &&
        (!runtime.supportedDeviceTypes ||
          runtime.supportedDeviceTypes.some(
            (supported) => supported.identifier === type.identifier,
          )),
    );
    if (deviceType)
      return { deviceType: deviceType.identifier, runtime: runtime.identifier };
  }
}

function isDefaultDevice(device: Catalog["devicetypes"][number]): boolean {
  return (
    /^iPhone\b/.test(device.name) &&
    !/\b(duo|fold|foldable)\b/i.test(device.name)
  );
}

async function installRuntime(
  version: string,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  const current = (installation ??= startRuntimeInstallation(version));
  current.waiters++;
  const cancelled = Promise.withResolvers<void>();
  const abort = () => cancelled.reject(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  try {
    await Promise.race([current.promise, cancelled.promise]);
  } finally {
    signal?.removeEventListener("abort", abort);
    if (!--current.waiters && installation === current) {
      installation = undefined;
      current.controller.abort();
    }
  }
}

function startRuntimeInstallation(version: string) {
  const controller = new AbortController();
  const promise = new Promise<void>((resolve, reject) => {
    logger.info(
      `Downloading and installing the iOS ${version} Simulator runtime through Xcode. This first-time download can take several minutes`,
    );
    const child = spawn(
      "xcodebuild",
      ["-downloadPlatform", "iOS", "-buildVersion", version],
      {
        stdio: ["ignore", 2, 2],
        timeout: 30 * 60_000,
        killSignal: "SIGKILL",
        signal: controller.signal,
      },
    );
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `Xcode could not install the iOS ${version} Simulator runtime (${signal ?? code}). Check the download output and available disk space, then retry`,
          ),
        );
    });
  }).finally(() => {
    if (installation?.controller === controller) installation = undefined;
  });
  return { promise, controller, waiters: 0 };
}
