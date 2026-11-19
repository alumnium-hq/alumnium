import { type ChildProcess, spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import path from "node:path";
import { Logger } from "@alumnium/core/internal";

const logger = Logger.get(import.meta.url);

const START_TIMEOUT_MS = 30_000;
const STOP_TIMEOUT_MS = 15_000;

export class IosRecording {
  #process?: ChildProcess;
  #finished?: Promise<boolean>;
  #closed = false;
  #ready = false;
  #stopping = false;
  #cleanup?: Promise<void>;
  #file?: string;

  async start(
    device: string,
    file: string,
    signal?: AbortSignal,
  ): Promise<void> {
    signal?.throwIfAborted();
    await fs.mkdir(path.dirname(file), { recursive: true });
    signal?.throwIfAborted();
    this.#file = file;
    const child = spawn(
      "xcrun",
      ["simctl", "io", device, "recordVideo", "--codec=h264", this.#file],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    this.#process = child;
    let started = () => {};
    let failed = (_error: Error) => {};
    const ready = new Promise<void>((resolve, reject) => {
      started = resolve;
      failed = reject;
    });
    const abort = () => failed(signal?.reason);
    signal?.addEventListener("abort", abort, { once: true });
    let output = "";
    const onData = (data: Buffer) => {
      output = (output + data.toString()).slice(-1024);
      if (output.includes("Recording started")) {
        this.#ready = true;
        started();
      }
    };
    child.stderr?.on("data", onData);
    this.#finished = new Promise<boolean>((resolve) => {
      child.once("error", (error) => {
        failed(error);
        resolve(false);
      });
      child.once("close", (code) => {
        this.#closed = true;
        if (!this.#ready)
          failed(
            new Error("Simulator recording stopped before its first frame"),
          );
        else if (!this.#stopping)
          logger.warn("Simulator recording ended before the run finished");
        resolve(code === 0);
      });
    });
    const timer = setTimeout(
      () => failed(new Error("Simulator recording did not start in time")),
      START_TIMEOUT_MS,
    );
    try {
      await ready;
    } catch (error) {
      await this.stop().catch(() => undefined);
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      child.stderr?.removeListener("data", onData);
      child.stderr?.resume();
    }
  }

  stop(): Promise<void> {
    this.#cleanup ??= this.#stop();
    return this.#cleanup;
  }

  async #stop(): Promise<void> {
    if (!this.#process || !this.#finished || !this.#file) return;
    this.#stopping = true;
    if (!this.#closed) this.#process.kill(this.#ready ? "SIGINT" : "SIGKILL");
    let forced = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => {
        forced = true;
        this.#process?.kill("SIGKILL");
        this.#process?.stderr?.destroy();
        this.#process?.unref();
        resolve(false);
      }, STOP_TIMEOUT_MS);
    });
    let complete: boolean;
    try {
      complete = await Promise.race([this.#finished, timedOut]);
    } finally {
      clearTimeout(timer);
    }
    const size = await fs.stat(this.#file).then(
      (stat) => stat.size,
      () => 0,
    );
    if (!this.#ready || !complete || forced || size === 0) {
      await fs.rm(this.#file, { force: true });
      throw new Error("Simulator video could not be finalized");
    }
  }
}
