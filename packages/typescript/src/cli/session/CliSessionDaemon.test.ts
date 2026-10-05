import fs from "node:fs/promises";
import net from "node:net";
import { describe, expect, it, vi } from "vitest";
import {
  createMockDir,
  pushTeardown,
  setupBeforeEach,
} from "../../../tests/unit/mocks.ts";
import type { McpTool } from "../../mcp/tools/McpTool.ts";
import { CliSessionDaemon } from "./CliSessionDaemon.ts";
import { CliSessionRegistry } from "./CliSessionRegistry.ts";
import { SocketConnection } from "./SocketConnection.ts";

describe("CliSessionDaemon", () => {
  const setup = setupBeforeEach(async () => {
    const dir = await createMockDir();
    return {
      registry: new CliSessionRegistry(dir.path),
      onExit: vi.fn((_code: number) => {}),
      start: vi.fn(async (_input: Record<string, unknown>) =>
        output({ id: "drv-1", platform_name: "chrome" }),
      ),
      stop: vi.fn(async (input: Record<string, unknown>) =>
        output({ stopped: input.id }),
      ),
      echo: vi.fn(async (input: Record<string, unknown>) => output(input)),
    };
  });

  async function startDaemon(overrides: Partial<CliSessionDaemon.Props> = {}) {
    const { registry, onExit, start, stop, echo } = setup.cur;
    const daemon = new CliSessionDaemon({
      session: "default",
      registry,
      start,
      startInput: { capabilities: "{}" },
      stop,
      tools: { echo },
      idleTimeoutMs: 0,
      onExit,
      ...overrides,
    });
    pushTeardown(() => daemon.terminate(false));
    const startText = await daemon.start();
    return { daemon, startText, socketPath: registry.socketPath("default") };
  }

  function useFakeTimers() {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"],
    });
    pushTeardown(() => {
      vi.useRealTimers();
    });
  }

  it("starts the driver and registers the session", async () => {
    const { registry, start } = setup.cur;
    const { daemon, startText } = await startDaemon();

    expect(start).toHaveBeenCalledWith({ capabilities: "{}" });
    expect(JSON.parse(startText)).toEqual({
      id: "drv-1",
      platform_name: "chrome",
    });
    expect(daemon.driverId).toBe("drv-1");
    expect(await registry.readEntry("default")).toMatchObject({
      name: "default",
      pid: process.pid,
      socketPath: registry.socketPath("default"),
      driverId: "drv-1",
      platform: "chrome",
      startOutput: startText,
    });
  });

  it("runs tools with the driver id injected", async () => {
    const { socketPath } = await startDaemon();

    const response = await request(socketPath, run(1, "echo", { goal: "x" }));

    expect(response).toEqual({
      id: 1,
      result: { text: JSON.stringify({ goal: "x", id: "drv-1" }) },
    });
  });

  it("reports tool errors and keeps serving", async () => {
    const { echo } = setup.cur;
    echo.mockRejectedValueOnce(new Error("boom"));
    const { socketPath } = await startDaemon();

    expect(await request(socketPath, run(1, "echo", {}))).toEqual({
      id: 1,
      error: "boom",
    });
    expect(await request(socketPath, run(2, "echo", {}))).toMatchObject({
      id: 2,
      result: {},
    });
  });

  it("rejects unknown tools", async () => {
    const { socketPath } = await startDaemon();

    expect(await request(socketPath, run(1, "nope", {}))).toEqual({
      id: 1,
      error: "Unknown tool: nope",
    });
  });

  it("serializes requests", async () => {
    const { echo } = setup.cur;
    const gate = Promise.withResolvers<void>();
    const events: string[] = [];
    echo.mockImplementation(async (input) => {
      events.push(`start ${input.n}`);
      if (input.n === 1) await gate.promise;
      events.push(`end ${input.n}`);
      return output(input);
    });
    const { socketPath } = await startDaemon();

    const first = request(socketPath, run(1, "echo", { n: 1 }));
    const second = request(socketPath, run(2, "echo", { n: 2 }));
    await vi.waitFor(() => expect(events).toEqual(["start 1"]));
    gate.resolve();
    await Promise.all([first, second]);

    expect(events).toEqual(["start 1", "end 1", "start 2", "end 2"]);
  });

  it("stops after in-flight commands finish", async () => {
    const { echo, stop, onExit, registry } = setup.cur;
    const gate = Promise.withResolvers<void>();
    echo.mockImplementation(async (input) => {
      await gate.promise;
      return output(input);
    });
    const { socketPath } = await startDaemon();

    const running = request(socketPath, run(1, "echo", { goal: "x" }));
    await vi.waitFor(() => expect(echo).toHaveBeenCalled());
    const stopping = request(socketPath, {
      id: 1,
      method: "stop",
      params: { saveCache: true },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(stop).not.toHaveBeenCalled();

    gate.resolve();

    expect(await running).toMatchObject({ id: 1, result: {} });
    expect(await stopping).toEqual({
      id: 1,
      result: { text: JSON.stringify({ stopped: "drv-1" }) },
    });
    expect(stop).toHaveBeenCalledWith({ id: "drv-1", save_cache: true });
    expect(onExit).toHaveBeenCalledWith(0);
    expect(await registry.readEntry("default")).toBeUndefined();
  });

  it("stops the driver after the idle timeout", async () => {
    useFakeTimers();
    const { stop, onExit, registry } = setup.cur;
    await startDaemon({ idleTimeoutMs: 60_000 });

    await vi.advanceTimersByTimeAsync(59_000);
    expect(onExit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(onExit).toHaveBeenCalledWith(0));
    expect(stop).toHaveBeenCalledWith({ id: "drv-1", save_cache: false });
    expect(await registry.readEntry("default")).toBeUndefined();
  });

  it("resets the idle timeout on every request", async () => {
    useFakeTimers();
    const { onExit } = setup.cur;
    const { socketPath } = await startDaemon({ idleTimeoutMs: 60_000 });

    await vi.advanceTimersByTimeAsync(59_000);
    await request(socketPath, run(1, "echo", {}));
    await vi.advanceTimersByTimeAsync(59_000);

    expect(onExit).not.toHaveBeenCalled();
  });

  it("stops the driver when its socket file is removed", async () => {
    // NOTE: Windows removes named pipes together with the owning process.
    if (process.platform === "win32") return;
    useFakeTimers();
    const { stop, onExit } = setup.cur;
    const { socketPath } = await startDaemon();

    await fs.rm(socketPath);
    await vi.advanceTimersByTimeAsync(1_000);

    await vi.waitFor(() => expect(onExit).toHaveBeenCalledWith(0));
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("terminates only once", async () => {
    const { stop, onExit } = setup.cur;
    const { daemon } = await startDaemon();

    await Promise.all([daemon.terminate(true), daemon.terminate(true)]);

    expect(stop).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

function output(value: unknown): McpTool.Output {
  return [{ type: "text", text: JSON.stringify(value) }];
}

function run(id: number, tool: string, input: Record<string, unknown>) {
  return { id, method: "run", params: { tool, input } };
}

function request(socketPath: string, message: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const connection = new SocketConnection(net.createConnection(socketPath));
    connection.onmessage = (response) => {
      connection.close();
      resolve(response);
    };
    connection.onclose = () => reject(new Error("closed"));
    connection.send(message).catch(reject);
  });
}
