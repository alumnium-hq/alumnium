import { existsSync } from "node:fs";
import os from "node:os";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { exec } from "../utils/process.ts";
import { SimulatorWindow } from "./SimulatorWindow.ts";

vi.hoisted(() => vi.resetModules());

vi.mock("node:fs", async (original) => ({
  ...(await original<typeof import("node:fs")>()),
  existsSync: vi.fn(),
}));
vi.mock("../utils/process.ts", () => ({ exec: vi.fn() }));

const developerDir = "/Applications/Chosen Xcode.app/Contents/Developer";
const deviceHub =
  "/Applications/Chosen Xcode.app/Contents/Applications/DeviceHub.app";
const simulator = developerDir + "/Applications/Simulator.app";
let window: SimulatorWindow;
let other: SimulatorWindow | undefined;

beforeEach(() => {
  window = new SimulatorWindow();
  other = undefined;
  vi.spyOn(os, "platform").mockReturnValue("darwin");
  vi.mocked(existsSync).mockReset().mockReturnValue(true);
  vi.mocked(exec)
    .mockReset()
    .mockImplementation(async (command) => ({
      status: 0,
      stderr: "",
      stdout: command === "xcrun" ? developerDir + "/usr/bin/simctl\n" : "",
    }));
});

afterEach(async () => {
  await window.close();
  await other?.close();
  vi.restoreAllMocks();
});

it("opens the selected Xcode's Device Hub with a device-specific URL", async () => {
  await window.open("owned-device");
  expect(exec).toHaveBeenNthCalledWith(1, "xcrun", ["--find", "simctl"]);
  expect(existsSync).toHaveBeenCalledWith(deviceHub);
  expect(exec).toHaveBeenLastCalledWith(
    "open",
    ["-a", deviceHub, "devices://device/open?id=owned-device"],
    { timeout: 10_000 },
  );
});

it("does not quit shared Device Hub when one session closes", async () => {
  await window.open("owned-device");
  vi.mocked(exec).mockClear();
  await window.close();
  expect(exec).not.toHaveBeenCalled();
});

it("opens the same session's window only once", async () => {
  await window.open("owned-device");
  await window.open("owned-device");
  expect(exec).toHaveBeenCalledTimes(2);
});

it("uses a URL for each session when Device Hub is already running", async () => {
  other = new SimulatorWindow();
  await window.open("first-device");
  await other.open("second-device");
  expect(exec).toHaveBeenCalledWith(
    "open",
    ["-a", deviceHub, "devices://device/open?id=second-device"],
    { timeout: 10_000 },
  );
});

it("falls back to the selected Xcode's legacy Simulator app", async () => {
  vi.mocked(existsSync).mockReturnValue(false);
  await window.open("owned-device");
  expect(exec).toHaveBeenLastCalledWith(
    "open",
    ["-a", simulator, "--args", "-CurrentDeviceUDID", "owned-device"],
    { timeout: 10_000 },
  );
});

it("keeps legacy Simulator open until its last session closes", async () => {
  vi.mocked(existsSync).mockReturnValue(false);
  other = new SimulatorWindow();
  await window.open("first-device");
  await other.open("second-device");
  vi.mocked(exec).mockClear();
  await window.close();
  expect(exec).not.toHaveBeenCalled();
  await other.close();
  expect(exec).toHaveBeenCalledExactlyOnceWith(
    "osascript",
    [
      "-e",
      'if application "/Applications/Chosen Xcode.app/Contents/Developer/Applications/Simulator.app" is running then tell application "/Applications/Chosen Xcode.app/Contents/Developer/Applications/Simulator.app" to quit',
    ],
    { timeout: 10_000 },
  );
});

it("skips app discovery and launch in headless mode", async () => {
  await window.open("owned-device", true);
  expect(exec).not.toHaveBeenCalled();
});

it("skips app discovery and launch on other operating systems", async () => {
  vi.mocked(os.platform).mockReturnValue("linux");
  await window.open("owned-device");
  expect(exec).not.toHaveBeenCalled();
});

it("does not claim a window when launch fails", async () => {
  vi.mocked(exec).mockRejectedValueOnce(new Error("missing Xcode"));
  await window.open("owned-device");
  await window.close();
  expect(exec).toHaveBeenCalledTimes(1);
});
