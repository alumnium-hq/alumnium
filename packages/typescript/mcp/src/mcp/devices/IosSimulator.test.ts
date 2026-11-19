import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Env, exec } from "@alumnium/core/internal";
import { IosSimulator } from "./IosSimulator.ts";
import { createMobileDevice } from "./MobileDevice.ts";

vi.mock("@alumnium/core/internal", async (original) => ({
  ...(await original<typeof import("@alumnium/core/internal")>()),
  exec: vi.fn(),
}));

const template = {
  udid: "source-device",
  name: "iPhone 18",
  deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-18",
};
let directory: string;
let app: string;
let simulator: IosSimulator;

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "alumnium-simulator-"));
  app = path.join(directory, "Test.app");
  await fs.mkdir(app);
  simulator = new IosSimulator("test");
  vi.mocked(exec)
    .mockReset()
    .mockImplementation(async (command, args) => ({
      status: 0,
      stderr: "",
      stdout: args.includes("list")
        ? JSON.stringify({ devices: { runtime: [template] } })
        : args.includes("create")
          ? "owned-device\n"
          : command === "/usr/libexec/PlistBuddy"
            ? "com.example.test\n"
            : "",
    }));
});

afterEach(async () => {
  await simulator.close().catch(() => {});
  await fs.rm(directory, { recursive: true, force: true });
});

describe("temporary iOS simulator", () => {
  it("creates from the selected template, boots, installs and preserves launch credentials", async () => {
    const options = {
      device: template.udid,
      app,
      appArguments: ["uiTests"],
      appEnvironment: { OAT: "private" },
      appReset: false,
    };
    expect(await simulator.prepare(options)).toEqual({
      ...options,
      device: "owned-device",
      app: "com.example.test",
    });
    expect(options.device).toBe(template.udid);
    expect(
      vi.mocked(exec).mock.calls.map(([command, args]) => [command, ...args]),
    ).toEqual([
      ["xcrun", "simctl", "list", "devices", "available", "--json"],
      [
        "xcrun",
        "simctl",
        "create",
        "Alumnium-test",
        template.deviceTypeIdentifier,
        "runtime",
      ],
      ["xcrun", "simctl", "boot", "owned-device"],
      ["xcrun", "simctl", "bootstatus", "owned-device", "-b"],
      [
        "/usr/libexec/PlistBuddy",
        "-c",
        "Print :CFBundleIdentifier",
        path.join(app, "Info.plist"),
      ],
      ["xcrun", "simctl", "install", "owned-device", app],
    ]);
    const closing = simulator.close();
    expect(simulator.close()).toBe(closing);
    await closing;
    expect(vi.mocked(exec).mock.calls.slice(-1)).toEqual([
      ["xcrun", ["simctl", "delete", "owned-device"]],
    ]);
  });

  it("keeps the fresh install when app reset was requested", async () => {
    expect(
      await simulator.prepare({ device: template.udid, app, appReset: true }),
    ).toMatchObject({ app: "com.example.test", appReset: false });
  });

  it("resolves a unique name and applies GPS to the new device", async () => {
    simulator = new IosSimulator("test", { latitude: 37.7, longitude: -122.4 });
    expect(
      await simulator.prepare({
        device: template.name,
        app: "com.apple.Preferences",
      }),
    ).toMatchObject({ device: "owned-device", app: "com.apple.Preferences" });
    expect(exec).toHaveBeenCalledWith(
      "xcrun",
      ["simctl", "location", "owned-device", "set", "37.7,-122.4"],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it.each(["missing"])(
    "rejects unavailable templates before creating anything: %s",
    async (device) => {
      await expect(simulator.prepare({ device })).rejects.toThrow(
        /requires|unavailable/,
      );
      await simulator.close();
      expect(
        vi
          .mocked(exec)
          .mock.calls.some(
            ([, args]) => args.includes("create") || args.includes("delete"),
          ),
      ).toBe(false);
    },
  );

  it("rejects ambiguous names without touching either template", async () => {
    vi.mocked(exec).mockResolvedValueOnce({
      status: 0,
      stderr: "",
      stdout: JSON.stringify({
        devices: { old: [template], new: [{ ...template, udid: "other" }] },
      }),
    });
    await expect(simulator.prepare({ device: template.name })).rejects.toThrow(
      "ambiguous",
    );
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it.each(["boot", "bootstatus", "install"])(
    "can delete a partially prepared device after %s fails",
    async (phase) => {
      const implementation = vi.mocked(exec).getMockImplementation()!;
      vi.mocked(exec).mockImplementation(async (command, args, options) => {
        if (args.includes(phase)) throw new Error(`${phase} failed`);
        return implementation(command, args, options);
      });
      await expect(
        simulator.prepare({ device: template.udid, app }),
      ).rejects.toThrow(`${phase} failed`);
      await simulator.close();
      expect(exec).toHaveBeenLastCalledWith("xcrun", [
        "simctl",
        "delete",
        "owned-device",
      ]);
    },
  );

  it("deletes directly without waiting for a separate shutdown", async () => {
    await simulator.prepare({ device: template.udid });
    vi.mocked(exec).mockClear();
    await simulator.close();
    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenLastCalledWith("xcrun", [
      "simctl",
      "delete",
      "owned-device",
    ]);
  });
});

describe("mobile device lifecycle selection", () => {
  beforeEach(() => {
    vi.stubEnv("ALUMNIUM_DRIVER", "maestro");
    Env.reset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    Env.reset();
  });

  it.each(["ios", "android", "chrome"])(
    "keeps existing %s sessions unchanged by default",
    (platform) => {
      expect(createMobileDevice(platform, {}, "test")).toBeUndefined();
    },
  );

  it.each(["maestro", "xcode"])(
    "selects iOS creation for %s and rejects unsupported platforms and invalid settings",
    (backend) => {
      vi.stubEnv("ALUMNIUM_DRIVER", backend);
      Env.reset();
      expect(
        createMobileDevice("ios", { deviceLifecycle: "create" }, "test"),
      ).toBeInstanceOf(IosSimulator);
      expect(() =>
        createMobileDevice("android", { deviceLifecycle: "create" }, "test"),
      ).toThrow("not supported");
      expect(() =>
        createMobileDevice("ios", { deviceLifecycle: "typo" }, "test"),
      ).toThrow();
      expect(() =>
        createMobileDevice(
          "ios",
          {
            deviceLifecycle: "create",
            deviceLocation: { latitude: 91, longitude: 0 },
          },
          "test",
        ),
      ).toThrow();
    },
  );
});

it.each(["boot", "bootstatus", "install"])(
  "cancels %s and deletes the simulator during startup shutdown",
  async (phase) => {
    const entered = Promise.withResolvers<void>();
    const implementation = vi.mocked(exec).getMockImplementation()!;
    vi.mocked(exec).mockImplementation(async (command, args, options) => {
      if (!args.includes(phase)) return implementation(command, args, options);
      return new Promise((_resolve, reject) => {
        const signal = options?.signal;
        if (!signal) throw new Error("Missing cancellation signal");
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
        entered.resolve();
      });
    });
    const failed = expect(
      simulator.prepare({ device: template.udid, app }),
    ).rejects.toMatchObject({ name: "AbortError" });
    await entered.promise;
    await simulator.close();
    await failed;
    expect(exec).toHaveBeenLastCalledWith("xcrun", [
      "simctl",
      "delete",
      "owned-device",
    ]);
  },
);

it("captures a newly created device's id before cancellation deletes it", async () => {
  const entered = Promise.withResolvers<void>();
  const created = Promise.withResolvers<void>();
  const implementation = vi.mocked(exec).getMockImplementation()!;
  vi.mocked(exec).mockImplementation(async (command, args, options) => {
    if (args.includes("create")) {
      entered.resolve();
      await created.promise;
    }
    return implementation(command, args, options);
  });
  const failed = expect(
    simulator.prepare({ device: template.udid }),
  ).rejects.toMatchObject({ name: "AbortError" });
  await entered.promise;
  const closing = simulator.close();
  created.resolve();
  await closing;
  await failed;
  expect(exec).toHaveBeenLastCalledWith("xcrun", [
    "simctl",
    "delete",
    "owned-device",
  ]);
  expect(
    vi.mocked(exec).mock.calls.some(([, args]) => args.includes("boot")),
  ).toBe(false);
});
