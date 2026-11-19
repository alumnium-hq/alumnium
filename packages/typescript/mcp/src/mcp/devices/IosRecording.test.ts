import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IosRecording } from "./IosRecording.ts";

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));

class RecordingProcess extends EventEmitter {
  stderr = new PassThrough();
  kill = vi.fn((_signal: string) => {
    this.emit("close", 0);
    return true;
  });
  unref = vi.fn();
}

let directory: string;
let file: string;
let child: RecordingProcess;
let recording: IosRecording;

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "alumnium-recording-"));
  file = path.join(directory, "videos/ios.mp4");
  child = new RecordingProcess();
  mocks.spawn.mockReset().mockReturnValue(child);
  recording = new IosRecording();
});

afterEach(async () => {
  vi.useRealTimers();
  child.emit("close", 0);
  await recording.stop().catch(() => {});
  await fs.rm(directory, { recursive: true, force: true });
});

async function begin() {
  const started = recording.start("owned-device", file);
  await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalledTimes(1));
  return { started };
}

async function ready() {
  const { started } = await begin();
  await fs.writeFile(file, "video");
  child.stderr.write("Recording sta");
  child.stderr.write("rted\n");
  await started;
}

describe("iOS simulator recording", () => {
  it("waits for recording readiness and finalizes the video once", async () => {
    await ready();
    expect(mocks.spawn).toHaveBeenCalledWith(
      "xcrun",
      ["simctl", "io", "owned-device", "recordVideo", "--codec=h264", file],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    const stopped = recording.stop();
    expect(recording.stop()).toBe(stopped);
    await stopped;
    expect(child.kill).toHaveBeenCalledExactlyOnceWith("SIGINT");
    expect(await fs.readFile(file, "utf8")).toBe("video");
  });

  it("handles spawn errors without waiting for the stop timeout", async () => {
    const { started } = await begin();
    child.emit("error", new Error("spawn failed"));
    await expect(started).rejects.toThrow("spawn failed");
    expect(await fs.stat(file).catch(() => undefined)).toBeUndefined();
  });

  it("rejects a recorder that exits before producing its first frame", async () => {
    const { started } = await begin();
    child.emit("close", 1);
    await expect(started).rejects.toThrow("before its first frame");
    expect(child.kill).not.toHaveBeenCalled();
  });

  it("stops a recorder that never becomes ready", async () => {
    vi.useFakeTimers();
    const { started } = await begin();
    const rejected = expect(started).rejects.toThrow("did not start in time");
    await vi.advanceTimersByTimeAsync(30_000);
    await rejected;
    expect(child.kill).toHaveBeenCalledExactlyOnceWith("SIGKILL");
  });

  it("kills a stuck recorder and removes its incomplete video", async () => {
    await ready();
    child.kill.mockImplementation(() => true);
    vi.useFakeTimers();
    const stopped = recording.stop();
    const rejected = expect(stopped).rejects.toThrow("could not be finalized");
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
    expect(child.kill.mock.calls).toEqual([["SIGINT"], ["SIGKILL"]]);
    expect(await fs.stat(file).catch(() => undefined)).toBeUndefined();
  });

  it.each(["empty", "failed"])("removes an %s recording", async (failure) => {
    await ready();
    if (failure === "empty") await fs.writeFile(file, "");
    else child.emit("close", 1);
    await expect(recording.stop()).rejects.toThrow("could not be finalized");
    expect(await fs.stat(file).catch(() => undefined)).toBeUndefined();
  });

  it("accepts a recording that finished before stop without signalling a stale pid", async () => {
    await ready();
    child.emit("close", 0);
    await recording.stop();
    expect(child.kill).not.toHaveBeenCalled();
    expect(await fs.readFile(file, "utf8")).toBe("video");
  });
});

it("kills an unready recorder promptly when startup is cancelled", async () => {
  const controller = new AbortController();
  const failed = expect(
    recording.start("owned-device", file, controller.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
  await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalledTimes(1));
  controller.abort();
  await failed;
  expect(child.kill).toHaveBeenCalledExactlyOnceWith("SIGKILL");
  expect(await fs.stat(file).catch(() => undefined)).toBeUndefined();
});
