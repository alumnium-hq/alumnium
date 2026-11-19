import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLlmUsageStats, Env, exec } from "@alumnium/core/internal";
import type { McpDriver } from "../mcpDrivers.ts";
import { McpState } from "../McpState.ts";
import { startMcpTool } from "./startMcpTool.ts";
import { stopMcpTool } from "./stopMcpTool.ts";

const mocks = vi.hoisted(() => {
  const close = vi.fn(async () => {});
  const launchApp = vi.fn(async () => {});
  const updateSettings = vi.fn(async () => {});
  const setGeoLocation = vi.fn(async () => {});
  const deleteSession = vi.fn(async () => {});
  const native = { close, launchApp };
  return {
    filesExist: false,
    close,
    launchApp,
    updateSettings,
    setGeoLocation,
    deleteSession,
    maestroStart: vi.fn(async () => native),
    xcodeStart: vi.fn(async () => native),
    remote: vi.fn(async (_options: Record<string, unknown>) => ({
      updateSettings,
      setGeoLocation,
      deleteSession,
    })),
    quit: vi.fn(async () => {}),
    construct: vi.fn(() => {}),
    saveCache: vi.fn(async () => {}),
    model: vi.fn(async () => ({ provider: "test", name: "test" })),
  };
});

vi.mock("alumnium", () => ({
  Alumni: class {
    readonly #raw: McpDriver;
    constructor(raw: McpDriver) {
      mocks.construct();
      this.#raw = raw;
    }
    cache = { save: mocks.saveCache };
    driver = { kind: "test" };
    model = mocks.model;
    async quit() {
      await mocks.quit();
      if ("close" in this.#raw) await this.#raw.close();
    }
    getStats() {
      return createLlmUsageStats();
    }
  },
}));
vi.mock("node:fs", async (original) => {
  const actual = await original<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: (...args: Parameters<typeof actual.existsSync>) =>
      mocks.filesExist || actual.existsSync(...args),
  };
});
vi.mock("webdriverio", () => ({ remote: mocks.remote }));
vi.mock("@alumnium/maestro", async (original) => ({
  ...(await original<typeof import("@alumnium/maestro")>()),
  MaestroSession: { start: mocks.maestroStart },
}));
vi.mock("@alumnium/xcode", async (original) => ({
  ...(await original<typeof import("@alumnium/xcode")>()),
  XcodeSession: { start: mocks.xcodeStart },
}));
vi.mock("@alumnium/core/internal", async (original) => ({
  ...(await original<typeof import("@alumnium/core/internal")>()),
  exec: vi.fn(),
}));

let directory: string;
let app: string;
let created: number;

beforeEach(async () => {
  McpState.clear();
  vi.clearAllMocks();
  created = 0;
  mocks.filesExist = false;
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "alumnium-start-"));
  app = path.join(directory, "Test.app");
  await fs.mkdir(app);
  vi.stubEnv("ALUMNIUM_DRIVER", "maestro");
  vi.stubEnv("ALUMNIUM_MCP_ARTIFACTS_DIR", directory);
  Env.reset();
  mocks.construct.mockReset();
  for (const method of [
    mocks.close,
    mocks.saveCache,
    mocks.quit,
    mocks.updateSettings,
    mocks.setGeoLocation,
    mocks.deleteSession,
  ])
    method.mockReset().mockResolvedValue(undefined);
  mocks.model.mockReset().mockResolvedValue({ provider: "test", name: "test" });
  mocks.maestroStart
    .mockReset()
    .mockResolvedValue({ close: mocks.close, launchApp: mocks.launchApp });
  mocks.xcodeStart
    .mockReset()
    .mockResolvedValue({ close: mocks.close, launchApp: mocks.launchApp });
  vi.mocked(exec)
    .mockReset()
    .mockImplementation(async (command, args) => ({
      status: 0,
      stderr: "",
      stdout: args.includes("list")
        ? JSON.stringify({
            devices: {
              runtime: [
                {
                  udid: "source",
                  name: "iPhone",
                  deviceTypeIdentifier: "type",
                },
              ],
            },
          })
        : args.includes("create")
          ? `owned-${++created}\n`
          : command === "/usr/libexec/PlistBuddy"
            ? "com.test\n"
            : "",
    }));
});

afterEach(async () => {
  await McpState.cleanupAllDrivers();
  McpState.clear();
  await fs.rm(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
  Env.reset();
});

async function start(
  options: Record<string, unknown> = {},
  capabilities: Record<string, unknown> = {},
  server_url?: string,
) {
  const output = await startMcpTool.execute({
    capabilities: JSON.stringify({
      platformName: "ios",
      ...capabilities,
      "alumnium:options": {
        device: "source",
        app,
        deviceLifecycle: "create",
        ...options,
      },
    }),
    ...(server_url ? { server_url } : {}),
  });
  return JSON.parse(output[0]!.text) as { id: string };
}

async function stop(id: string) {
  await stopMcpTool.execute({ id, save_cache: false });
}

function backend(name: string) {
  vi.stubEnv("ALUMNIUM_DRIVER", name);
  Env.reset();
}

describe("MCP simulator lifecycle", () => {
  it.each(["maestro", "xcode"])(
    "prepares and deletes the actual simulator for %s",
    async (name) => {
      backend(name);
      const result = await start({
        appArguments: ["uiTests"],
        appEnvironment: { token: "private" },
      });
      const factory =
        name === "maestro" ? mocks.maestroStart : mocks.xcodeStart;
      expect(factory).toHaveBeenCalledWith(
        expect.objectContaining({
          appId: "com.test",
          launchArgs: ["uiTests"],
          launchEnv: { token: "private" },
          ...(name === "maestro"
            ? { deviceId: "owned-1" }
            : { device: "owned-1" }),
        }),
      );
      expect(mocks.remote).not.toHaveBeenCalled();
      await stop(result.id);
      expect(exec).toHaveBeenLastCalledWith("xcrun", [
        "simctl",
        "delete",
        "owned-1",
      ]);
      expect(mocks.close).toHaveBeenCalledTimes(1);
    },
  );

  it("keeps multiple simulator sessions independent", async () => {
    const [first, second] = await Promise.all([start(), start()]);
    expect(first.id).not.toBe(second.id);
    await stop(first.id);
    expect(
      vi.mocked(exec).mock.calls.filter(([, args]) => args.includes("delete")),
    ).toHaveLength(1);
    await stop(second.id);
    expect(
      vi.mocked(exec).mock.calls.filter(([, args]) => args.includes("delete")),
    ).toHaveLength(2);
  });

  it.each(["maestro", "xcode", "appium-ios"])(
    "does not provision local devices for existing %s sessions",
    async (name) => {
      backend(name);
      const result = await start({
        deviceLifecycle: undefined,
        app: "com.test",
      });
      await stop(result.id);
      expect(exec).not.toHaveBeenCalled();
      if (name === "appium-ios")
        expect(mocks.deleteSession).toHaveBeenCalledTimes(1);
    },
  );

  it("cleans up a partially booted simulator when preparation fails", async () => {
    vi.mocked(exec)
      .mockResolvedValueOnce({
        status: 0,
        stderr: "",
        stdout: JSON.stringify({
          devices: {
            runtime: [
              { udid: "source", name: "iPhone", deviceTypeIdentifier: "type" },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({ status: 0, stderr: "", stdout: "owned-1" })
      .mockRejectedValueOnce(new Error("boot failed"));
    await expect(start()).rejects.toThrow("boot failed");
    expect(mocks.maestroStart).not.toHaveBeenCalled();
    expect(exec).toHaveBeenLastCalledWith("xcrun", [
      "simctl",
      "delete",
      "owned-1",
    ]);
  });

  it.each(["maestro", "xcode"])(
    "deletes the temporary simulator when %s startup fails",
    async (name) => {
      backend(name);
      const factory =
        name === "maestro" ? mocks.maestroStart : mocks.xcodeStart;
      factory.mockRejectedValueOnce(new Error("driver failed"));
      await expect(start()).rejects.toThrow("driver failed");
      expect(exec).toHaveBeenLastCalledWith("xcrun", [
        "simctl",
        "delete",
        "owned-1",
      ]);
    },
  );

  it("preserves late startup errors while releasing both native resources", async () => {
    mocks.model.mockRejectedValueOnce(new Error("model failed"));
    mocks.quit.mockRejectedValueOnce(new Error("quit failed"));
    await expect(start()).rejects.toThrow("model failed");
    expect(mocks.close).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenLastCalledWith("xcrun", [
      "simctl",
      "delete",
      "owned-1",
    ]);
  });

  it("closes the raw driver if constructing Alumni fails", async () => {
    mocks.construct.mockImplementationOnce(() => {
      throw new Error("invalid model");
    });
    await expect(start()).rejects.toThrow("invalid model");
    expect(mocks.close).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenLastCalledWith("xcrun", [
      "simctl",
      "delete",
      "owned-1",
    ]);
  });

  it("still deletes the simulator when saving the cache fails", async () => {
    const result = await start();
    mocks.saveCache.mockRejectedValueOnce(new Error("cache failed"));
    await expect(
      stopMcpTool.execute({ id: result.id, save_cache: true }),
    ).rejects.toThrow("cache failed");
    expect(mocks.close).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenLastCalledWith("xcrun", [
      "simctl",
      "delete",
      "owned-1",
    ]);
  });

  it.each([
    undefined,
    "http://127.0.0.1:4723",
    "https://remote.example/wd/hub",
  ])("delegates fresh Appium simulators to endpoint %s", async (endpoint) => {
    backend("appium-ios");
    const result = await start(
      {
        device: "iPhone 18",
        app: "/server/build/Test.app",
        appArguments: ["uiTests"],
        appEnvironment: { token: "private" },
        deviceLocation: { latitude: 37.7, longitude: -122.4 },
        headless: true,
      },
      { "appium:platformVersion": "26.5" },
      endpoint,
    );
    expect(exec).not.toHaveBeenCalled();
    expect(mocks.remote).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilities: expect.objectContaining({
          "appium:enforceFreshSimulatorCreation": true,
          "appium:automationName": "XCUITest",
          "appium:app": "/server/build/Test.app",
          "appium:deviceName": "iPhone 18",
          "appium:platformVersion": "26.5",
          "appium:isHeadless": true,
          "appium:processArguments": {
            args: ["uiTests"],
            env: { token: "private" },
          },
        }),
      }),
    );
    expect(mocks.setGeoLocation).toHaveBeenCalledWith({
      latitude: 37.7,
      longitude: -122.4,
    });
    await stop(result.id);
    expect(mocks.deleteSession).toHaveBeenCalledTimes(1);
  });

  it("uses the configured Appium endpoint without inspecting local devices or app files", async () => {
    vi.stubEnv("ALUMNIUM_APPIUM_SERVER", "https://configured.example/appium");
    backend("appium-ios");
    const result = await start({ device: "iPhone 18", app: "lt://cloud-app" });
    expect(mocks.remote).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: "configured.example",
        path: "/appium",
        capabilities: expect.objectContaining({
          "appium:app": "lt://cloud-app",
        }),
      }),
    );
    expect(exec).not.toHaveBeenCalled();
    await stop(result.id);
  });

  it("preserves grouped Appium options and applies fresh creation inside the group", async () => {
    backend("appium-ios");
    const result = await start(
      { device: "iPhone 18", app: "https://builds.example/Test.app.zip" },
      {
        "appium:options": {
          platformVersion: "26.5",
          enforceFreshSimulatorCreation: false,
        },
        "vendor:options": { pool: "simulators" },
      },
    );
    expect(mocks.remote).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilities: expect.objectContaining({
          "appium:options": {
            platformVersion: "26.5",
            enforceFreshSimulatorCreation: true,
            automationName: "XCUITest",
            deviceName: "iPhone 18",
            app: "https://builds.example/Test.app.zip",
          },
          "vendor:options": { pool: "simulators" },
        }),
      }),
    );
    await stop(result.id);
  });

  it.each([
    { "appium:udid": "fixed-device" },
    { "appium:options": { udid: "fixed-device" } },
    { "appium:automationName": "Other" },
    { "appium:options": { automationName: "Other" } },
  ])(
    "rejects incompatible Appium creation before connecting: %j",
    async (capabilities) => {
      backend("appium-ios");
      await expect(
        start({ device: "iPhone 18" }, capabilities),
      ).rejects.toThrow(/fixed UDID|XCUITest/);
      expect(mocks.remote).not.toHaveBeenCalled();
      expect(exec).not.toHaveBeenCalled();
    },
  );

  it("rejects a generic Appium UDID for fresh creation", async () => {
    backend("appium-ios");
    await expect(
      start({ device: "5FEB61C5-E3F5-471D-AE23-8A07438D5E92" }),
    ).rejects.toThrow("fixed UDID");
    expect(mocks.remote).not.toHaveBeenCalled();
  });

  it.each(["settings", "location", "model", "constructor"])(
    "ends the Appium session after a %s failure",
    async (phase) => {
      backend("appium-ios");
      if (phase === "settings")
        mocks.updateSettings.mockRejectedValueOnce(
          new Error("settings failed"),
        );
      if (phase === "location")
        mocks.setGeoLocation.mockRejectedValueOnce(
          new Error("location failed"),
        );
      if (phase === "model")
        mocks.model.mockRejectedValueOnce(new Error("model failed"));
      if (phase === "constructor")
        mocks.construct.mockImplementationOnce(() => {
          throw new Error("constructor failed");
        });
      await expect(
        start(
          {
            device: "iPhone 18",
            deviceLocation: { latitude: 0, longitude: 0 },
          },
          { "appium:settings": { snapshotMaxDepth: 10 } },
        ),
      ).rejects.toThrow(`${phase} failed`);
      expect(mocks.deleteSession).toHaveBeenCalledTimes(1);
      expect(exec).not.toHaveBeenCalled();
    },
  );

  it("preserves an Appium startup error even when remote cleanup also fails", async () => {
    backend("appium-ios");
    mocks.updateSettings.mockRejectedValueOnce(new Error("settings failed"));
    mocks.deleteSession.mockRejectedValueOnce(new Error("delete failed"));
    await expect(
      start(
        { device: "iPhone 18" },
        { "appium:settings": { snapshotMaxDepth: 10 } },
      ),
    ).rejects.toThrow("settings failed");
    expect(mocks.deleteSession).toHaveBeenCalledTimes(1);
  });

  it("fails clearly when the server rejects fresh simulator provisioning", async () => {
    backend("appium-ios");
    mocks.remote.mockRejectedValueOnce(
      new Error("Unsupported capability: enforceFreshSimulatorCreation"),
    );
    await expect(start({ device: "iPhone 18" })).rejects.toThrow(
      "Unsupported capability",
    );
    expect(exec).not.toHaveBeenCalled();
  });
  it("rejects fresh Android Appium requests without allocating a session", async () => {
    backend("appium-android");
    await expect(
      start({ device: "Pixel 9" }, { platformName: "android" }),
    ).rejects.toThrow("only supported for iOS");
    expect(mocks.remote).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
  });
  it("does not classify remote bundle IDs using client filesystem contents", async () => {
    backend("appium-ios");
    mocks.filesExist = true;
    const result = await start({ device: "iPhone 18", app: "com.example.app" });
    expect(mocks.remote).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilities: expect.objectContaining({
          "appium:bundleId": "com.example.app",
        }),
      }),
    );
    expect(mocks.remote.mock.calls[0]?.[0].capabilities).not.toHaveProperty(
      "appium:app",
    );
    await stop(result.id);
  });
});
