import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLlmUsageStats, Env, exec } from "@alumnium/core/internal";
import { createMobileDriver, type McpDriver } from "../mcpDrivers.ts";
import { McpState } from "../McpState.ts";
import { startMcpTool } from "./startMcpTool.ts";
import { stopMcpTool } from "./stopMcpTool.ts";

const mocks = vi.hoisted(() => ({
  quit: vi.fn(async () => {}),
  closeDriver: vi.fn(async () => {}),
  construct: vi.fn(() => {}),
  saveCache: vi.fn(async () => {}),
  model: vi.fn(async () => ({ provider: "test", name: "test" })),
}));

vi.mock("alumnium", () => ({
  Alumni: class {
    constructor() {
      mocks.construct();
    }
    cache = { save: mocks.saveCache };
    driver = { kind: "maestro" };
    quit = mocks.quit;
    model = mocks.model;
    getStats() {
      return createLlmUsageStats();
    }
  },
}));
vi.mock("../mcpDrivers.ts", async (original) => ({
  ...(await original<typeof import("../mcpDrivers.ts")>()),
  createMobileDriver: vi.fn(),
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
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "alumnium-start-"));
  app = path.join(directory, "Test.app");
  await fs.mkdir(app);
  vi.stubEnv("ALUMNIUM_DRIVER", "maestro");
  vi.stubEnv("ALUMNIUM_MCP_ARTIFACTS_DIR", directory);
  Env.reset();
  vi.mocked(createMobileDriver).mockResolvedValue({
    close: mocks.closeDriver,
  } as unknown as McpDriver);
  mocks.construct.mockReset();
  mocks.closeDriver.mockReset().mockResolvedValue(undefined);
  mocks.saveCache.mockReset().mockResolvedValue(undefined);
  mocks.model.mockResolvedValue({ provider: "test", name: "test" });
  mocks.quit.mockResolvedValue(undefined);
  vi.mocked(exec).mockImplementation(async (command, args) => ({
    status: 0,
    stderr: "",
    stdout: args.includes("--show-sdk-version")
      ? "27.2"
      : args.includes("list")
        ? JSON.stringify({
            devicetypes: [
              {
                identifier: "type",
                name: "iPhone 18 Pro",
                minRuntimeVersion: 0,
                maxRuntimeVersion: 4294967295,
              },
            ],
            runtimes: [
              {
                identifier: "com.apple.CoreSimulator.SimRuntime.iOS-27-2",
                version: "27.2",
                isAvailable: true,
              },
            ],
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

async function start(options: Record<string, unknown> = {}) {
  const capabilities = JSON.stringify({
    platformName: "ios",
    "alumnium:options": {
      device: "source",
      app,
      deviceLifecycle: "create",
      ...options,
    },
  });
  const output = await startMcpTool.execute({ capabilities });
  return JSON.parse(output[0]!.text) as { id: string; driver: string };
}

describe("MCP simulator lifecycle", () => {
  it("starts with actual device capabilities and deletes only the owned device on stop", async () => {
    const result = await start({
      appArguments: ["uiTests"],
      appEnvironment: { token: "private" },
    });
    expect(createMobileDriver).toHaveBeenCalledWith(
      "ios",
      { platformName: "ios" },
      null,
      expect.objectContaining({
        app: "com.test",
        device: "owned-1",
        appArguments: ["uiTests"],
        appEnvironment: { token: "private" },
      }),
    );
    expect(
      vi.mocked(exec).mock.calls.some(([, args]) => args.includes("delete")),
    ).toBe(false);
    await stopMcpTool.execute({ id: result.id, save_cache: false });
    expect(exec).toHaveBeenLastCalledWith("xcrun", [
      "simctl",
      "delete",
      "owned-1",
    ]);
    expect(
      vi
        .mocked(exec)
        .mock.calls.some(
          ([, args]) => args.includes("shutdown") && args.includes("source"),
        ),
    ).toBe(false);
    expect(mocks.quit).toHaveBeenCalledTimes(1);
  });

  it("creates a simulator when the caller does not provide a template", async () => {
    const result = await start({ device: undefined });
    expect(exec).toHaveBeenCalledWith("xcrun", [
      "--sdk",
      "iphonesimulator",
      "--show-sdk-version",
    ]);
    expect(createMobileDriver).toHaveBeenCalledWith(
      "ios",
      expect.anything(),
      null,
      expect.objectContaining({ device: "owned-1", app: "com.test" }),
    );
    await stopMcpTool.execute({ id: result.id, save_cache: false });
    expect(exec).toHaveBeenLastCalledWith("xcrun", [
      "simctl",
      "delete",
      "owned-1",
    ]);
  });

  it("keeps multiple sessions independent through separate stop calls", async () => {
    const [first, second] = await Promise.all([
      start({ appEnvironment: { token: "first" } }),
      start({ appEnvironment: { token: "second" } }),
    ]);
    expect(first.id).not.toBe(second.id);
    const calls = vi.mocked(createMobileDriver).mock.calls;
    expect(calls.map(([, , , options]) => options?.device)).toEqual(
      expect.arrayContaining(["owned-1", "owned-2"]),
    );
    expect(calls.map(([, , , options]) => options?.appEnvironment)).toEqual([
      { token: "first" },
      { token: "second" },
    ]);
    await stopMcpTool.execute({ id: first.id, save_cache: false });
    expect(
      vi.mocked(exec).mock.calls.filter(([, args]) => args.includes("delete")),
    ).toHaveLength(1);
    await stopMcpTool.execute({ id: second.id, save_cache: false });
    expect(
      vi.mocked(exec).mock.calls.filter(([, args]) => args.includes("delete")),
    ).toHaveLength(2);
  });

  it.each(["maestro", "xcode", "appium-ios", "appium-android", "selenium"])(
    "preserves the default existing-device path for %s without simulator commands",
    async (backend) => {
      vi.stubEnv("ALUMNIUM_DRIVER", backend);
      Env.reset();
      const result = await start({
        deviceLifecycle: undefined,
        app: "com.test",
      });
      await stopMcpTool.execute({ id: result.id, save_cache: false });
      expect(exec).not.toHaveBeenCalled();
      expect(createMobileDriver).toHaveBeenCalledWith(
        "ios",
        expect.anything(),
        null,
        expect.objectContaining({ app: "com.test", device: "source" }),
      );
    },
  );

  it.each(["appium-ios", "appium-android", "selenium"])(
    "rejects temporary simulator creation for %s before allocating resources",
    async (backend) => {
      vi.stubEnv("ALUMNIUM_DRIVER", backend);
      Env.reset();
      await expect(start()).rejects.toThrow(
        "deviceLifecycle: create is only supported for Maestro and Xcode",
      );
      expect(exec).not.toHaveBeenCalled();
      expect(createMobileDriver).not.toHaveBeenCalled();
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
    expect(createMobileDriver).not.toHaveBeenCalled();
    expect(exec).toHaveBeenLastCalledWith("xcrun", [
      "simctl",
      "delete",
      "owned-1",
    ]);
  });

  it("deletes the temporary simulator when driver startup fails", async () => {
    vi.mocked(createMobileDriver).mockRejectedValueOnce(
      new Error("driver failed"),
    );
    await expect(start()).rejects.toThrow("driver failed");
    expect(exec).toHaveBeenLastCalledWith("xcrun", [
      "simctl",
      "delete",
      "owned-1",
    ]);
  });

  it("preserves late startup failures while closing both resources", async () => {
    mocks.model.mockRejectedValueOnce(new Error("model failed"));
    mocks.quit.mockRejectedValueOnce(new Error("quit failed"));
    await expect(start()).rejects.toThrow("model failed");
    expect(mocks.quit).toHaveBeenCalledTimes(1);
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
    expect(mocks.closeDriver).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenLastCalledWith("xcrun", [
      "simctl",
      "delete",
      "owned-1",
    ]);
  });

  it("still deletes the simulator when saving the cache fails during stop", async () => {
    const result = await start();
    mocks.saveCache.mockRejectedValueOnce(new Error("cache failed"));
    await expect(
      stopMcpTool.execute({ id: result.id, save_cache: true }),
    ).rejects.toThrow("cache failed");
    expect(mocks.quit).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenLastCalledWith("xcrun", [
      "simctl",
      "delete",
      "owned-1",
    ]);
  });
});
