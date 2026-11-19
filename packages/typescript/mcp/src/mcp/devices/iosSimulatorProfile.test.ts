import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { exec } from "@alumnium/core/internal";

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("@alumnium/core/internal", async (original) => ({
  ...(await original<typeof import("@alumnium/core/internal")>()),
  exec: vi.fn(),
}));

const phone = {
  identifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-18-Pro",
  name: "iPhone 18 Pro",
  minRuntimeVersion: 1769472,
  maxRuntimeVersion: 4294967295,
};
const olderPhone = {
  ...phone,
  identifier: "older",
  name: "iPhone 17",
  minRuntimeVersion: 1703936,
};
const foldable = {
  ...phone,
  identifier: "fold",
  name: "iPhone Duo",
  minRuntimeVersion: 1769728,
};
const ipad = {
  ...phone,
  identifier: "ipad",
  name: "iPad Pro",
  minRuntimeVersion: 1769984,
};
const runtime = {
  identifier: "com.apple.CoreSimulator.SimRuntime.iOS-27-2",
  version: "27.2",
  isAvailable: true,
  supportedDeviceTypes: [phone, olderPhone, ipad],
};
let catalog: {
  devices: Record<
    string,
    Array<{
      udid: string;
      name: string;
      deviceTypeIdentifier: string;
      isAvailable?: boolean;
    }>
  >;
  devicetypes: (typeof phone)[];
  runtimes: (typeof runtime)[];
};
let resolveProfile: typeof import("./iosSimulatorProfile.ts").resolveIosSimulatorProfile;
let downloaded: () => void;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  downloaded = () => {
    catalog.runtimes = [runtime];
  };
  catalog = {
    devices: {},
    devicetypes: [olderPhone, ipad, foldable, phone],
    runtimes: [runtime],
  };
  vi.mocked(exec).mockImplementation(async (_command, args) => ({
    status: 0,
    stderr: "",
    stdout: args.includes("--show-sdk-version")
      ? "27.2\n"
      : JSON.stringify(catalog),
  }));
  mocks.spawn.mockImplementation(() => {
    const child = new EventEmitter();
    queueMicrotask(() => {
      downloaded();
      child.emit("close", 0);
    });
    return child;
  });
  ({ resolveIosSimulatorProfile: resolveProfile } =
    await import("./iosSimulatorProfile.ts"));
});

describe("iOS simulator profiles", () => {
  it("chooses a compatible iPhone without any existing simulator devices", async () => {
    expect(await resolveProfile()).toEqual({
      deviceType: phone.identifier,
      runtime: runtime.identifier,
    });
    expect(catalog.devices).toEqual({});
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(
      vi.mocked(exec).mock.calls.every(([, args]) => !args.includes("create")),
    ).toBe(true);
  });

  it("matches the selected Xcode SDK instead of reusing an older installed runtime", async () => {
    catalog.runtimes = [
      {
        ...runtime,
        version: "26.5",
        identifier: "com.apple.CoreSimulator.SimRuntime.iOS-26-5",
      },
    ];
    await resolveProfile();
    expect(mocks.spawn).toHaveBeenCalledExactlyOnceWith(
      "xcodebuild",
      ["-downloadPlatform", "iOS", "-buildVersion", "27.2"],
      expect.objectContaining({ stdio: ["ignore", 2, 2] }),
    );
  });

  it.each(["missing", "unavailable"])(
    "installs a %s runtime and rereads the installed catalog",
    async (state) => {
      catalog.runtimes =
        state === "missing" ? [] : [{ ...runtime, isAvailable: false }];
      expect(await resolveProfile()).toEqual({
        deviceType: phone.identifier,
        runtime: runtime.identifier,
      });
      expect(mocks.spawn).toHaveBeenCalledTimes(1);
      expect(
        vi.mocked(exec).mock.calls.filter(([, args]) => args.includes("list")),
      ).toHaveLength(2);
    },
  );

  it("joins concurrent runtime downloads", async () => {
    catalog.runtimes = [];
    const installer = new EventEmitter();
    mocks.spawn.mockReturnValue(installer);
    const first = resolveProfile();
    const second = resolveProfile();
    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalledTimes(1));
    downloaded();
    installer.emit("close", 0);
    expect(await first).toEqual(await second);
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
  });

  it("preserves runtime download failures and allows retry", async () => {
    catalog.runtimes = [];
    mocks.spawn.mockImplementationOnce(() => {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit("close", 1));
      return child;
    });
    await expect(resolveProfile()).rejects.toThrow(
      "Xcode could not install the iOS 27.2",
    );
    expect(await resolveProfile()).toEqual({
      deviceType: phone.identifier,
      runtime: runtime.identifier,
    });
    expect(mocks.spawn).toHaveBeenCalledTimes(2);
  });

  it("preserves installer spawn errors and allows retry", async () => {
    catalog.runtimes = [];
    mocks.spawn.mockImplementationOnce(() => {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit("error", new Error("installer failed")));
      return child;
    });
    await expect(resolveProfile()).rejects.toThrow("installer failed");
    await expect(resolveProfile()).resolves.toBeDefined();
  });

  it("does not report success when a download leaves the runtime unavailable", async () => {
    catalog.runtimes = [];
    downloaded = () => {};
    await expect(resolveProfile()).rejects.toThrow(
      "after runtime installation",
    );
  });

  it("rejects missing iPhone device profiles before downloading", async () => {
    catalog.devicetypes = [ipad, foldable];
    await expect(resolveProfile()).rejects.toThrow("first-launch setup");
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it("excludes incompatible device types and specialized runtimes", async () => {
    catalog.devicetypes.push({
      ...phone,
      name: "iPhone 20",
      identifier: "future",
      minRuntimeVersion: 1835008,
    });
    catalog.devicetypes.push({
      ...phone,
      name: "iPhone 1",
      identifier: "obsolete",
      maxRuntimeVersion: 1703936,
    });
    catalog.runtimes.unshift({
      ...runtime,
      identifier: `${runtime.identifier}-special`,
      supportedDeviceTypes: [foldable],
    });
    expect(await resolveProfile()).toEqual({
      deviceType: phone.identifier,
      runtime: runtime.identifier,
    });
  });

  it("explains missing Xcode prerequisites without attempting installation", async () => {
    vi.mocked(exec).mockRejectedValueOnce(new Error("xcrun missing"));
    await expect(resolveProfile()).rejects.toThrow("Install Xcode");
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it("preserves an explicitly selected template's model and runtime", async () => {
    catalog.devices = {
      "older-runtime": [
        {
          udid: "source",
          name: "Renamed",
          deviceTypeIdentifier: "pinned-type",
        },
      ],
    };
    expect(await resolveProfile("SOURCE")).toEqual({
      deviceType: "pinned-type",
      runtime: "older-runtime",
    });
    expect(exec).toHaveBeenCalledTimes(1);
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it.each(["unknown", "unavailable", "ambiguous"])(
    "rejects an %s explicit template without silently downloading another runtime",
    async (state) => {
      const device = {
        udid: "source",
        name: "Phone",
        deviceTypeIdentifier: phone.identifier,
      };
      if (state === "unavailable")
        catalog.devices = { runtime: [{ ...device, isAvailable: false }] };
      if (state === "ambiguous")
        catalog.devices = {
          first: [device],
          second: [{ ...device, udid: "other" }],
        };
      await expect(
        resolveProfile(state === "unknown" ? "missing" : "Phone"),
      ).rejects.toThrow("unavailable or ambiguous");
      expect(mocks.spawn).not.toHaveBeenCalled();
    },
  );
});

it("keeps a shared runtime download alive until all callers cancel", async () => {
  catalog.runtimes = [];
  const installer = new EventEmitter();
  let installationSignal: AbortSignal | undefined;
  mocks.spawn.mockImplementationOnce((_command, _args, options) => {
    installationSignal = options.signal;
    return installer;
  });
  const first = new AbortController();
  const second = new AbortController();
  const firstFailed = expect(
    resolveProfile(undefined, first.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
  const secondFailed = expect(
    resolveProfile(undefined, second.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
  await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalledTimes(1));
  first.abort();
  await firstFailed;
  expect(installationSignal?.aborted).toBe(false);
  second.abort();
  await secondFailed;
  expect(installationSignal?.aborted).toBe(true);
  installer.emit("error", new Error("cancelled"));
  await expect(resolveProfile()).resolves.toBeDefined();
});

it("allows another caller to complete a shared download after one cancels", async () => {
  catalog.runtimes = [];
  const installer = new EventEmitter();
  mocks.spawn.mockReturnValueOnce(installer);
  const controller = new AbortController();
  const failed = expect(
    resolveProfile(undefined, controller.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
  const successful = resolveProfile();
  await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalledTimes(1));
  controller.abort();
  await failed;
  downloaded();
  installer.emit("close", 0);
  await expect(successful).resolves.toEqual({
    deviceType: phone.identifier,
    runtime: runtime.identifier,
  });
});
