import { always } from "alwaysly";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import { describe, expect, it, vi } from "vitest";
import {
  createMockDir,
  pushMock,
  pushTeardown,
  setupBeforeEach,
} from "../../../../alumnium/tests/unit/mocks.ts";
import type { McpTool } from "../../mcp/tools/McpTool.ts";
import { CliProtocol } from "./CliProtocol.ts";
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

  /**
   * `onMessage` enqueues a request right after parsing it, so a parsed message
   * is an enqueued request.
   */
  function spyOnParsedRequests() {
    const parsed = vi.spyOn(CliProtocol.Request, "safeParse");
    pushMock(parsed);
    return parsed;
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

    const parsed = spyOnParsedRequests();
    const running = request(socketPath, run(1, "echo", { goal: "x" }));
    await vi.waitFor(() => expect(echo).toHaveBeenCalled());
    const stopping = request(socketPath, {
      id: 1,
      method: "stop",
      params: { saveCache: true },
    });
    await vi.waitFor(() =>
      expect(parsed).toHaveBeenCalledWith(
        expect.objectContaining({ method: "stop" }),
      ),
    );
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

  it("does not stop on idle while a request is in flight", async () => {
    useFakeTimers();
    const { echo, stop, onExit } = setup.cur;
    const gate = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    echo.mockImplementation(async (input) => {
      started.resolve();
      await gate.promise;
      return output(input);
    });
    const { socketPath } = await startDaemon({ idleTimeoutMs: 60_000 });

    const pending = request(socketPath, run(1, "echo", {}));
    await started.promise;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(onExit).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();

    gate.resolve();
    await pending;
    // NOTE: Fake timers leave real I/O alone, let a wrongly queued stop run.
    for (let i = 0; i < 20; i++) await fs.stat(socketPath);
    await vi.advanceTimersByTimeAsync(59_000);
    expect(onExit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(onExit).toHaveBeenCalledWith(0));
    expect(stop).toHaveBeenCalledWith({ id: "drv-1", save_cache: false });
  });

  it("stops the driver and removes the socket when registering fails", async () => {
    const { registry, stop } = setup.cur;
    vi.spyOn(registry, "writeEntry").mockRejectedValue(new Error("disk full"));
    pushMock(vi.mocked(registry.writeEntry));

    await expect(startDaemon()).rejects.toThrow("disk full");

    expect(stop).toHaveBeenCalledWith({ id: "drv-1" });
    expect(fsSync.existsSync(registry.socketPath("default"))).toBe(false);
  });

  it("rejects unparsable start output without listening", async () => {
    // NOTE: Without a driver id there is nothing to stop.
    const { registry, start, stop } = setup.cur;
    start.mockResolvedValue([{ type: "text", text: "not json" }]);

    await expect(startDaemon()).rejects.toThrow();

    expect(stop).not.toHaveBeenCalled();
    expect(fsSync.existsSync(registry.socketPath("default"))).toBe(false);
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

  it("keeps the registry entry and socket of a successor daemon", async () => {
    // NOTE: Windows removes named pipes together with the owning process.
    if (process.platform === "win32") return;
    const { registry } = setup.cur;
    const { daemon, socketPath } = await startDaemon();

    // Simulate a successor daemon taking over the same session.
    await fs.rm(socketPath);
    await fs.writeFile(socketPath, "");
    const entry = await registry.readEntry("default");
    always(entry);
    await registry.writeEntry({ ...entry, pid: process.pid + 1 });

    await daemon.terminate(true);

    expect(await registry.readEntry("default")).toMatchObject({
      pid: process.pid + 1,
    });
    await expect(fs.stat(socketPath)).resolves.toBeDefined();
    await fs.rm(socketPath, { force: true });
  });

  describe("removeOwnedFilesSync", () => {
    it("removes its own entry and socket", async () => {
      // NOTE: Windows removes named pipes together with the owning process.
      if (process.platform === "win32") return;
      const { registry } = setup.cur;
      const { daemon, socketPath } = await startDaemon();

      daemon.removeOwnedFilesSync();

      expect(await registry.readEntry("default")).toBeUndefined();
      await expect(fs.stat(socketPath)).rejects.toThrow();
    });

    it("keeps the entry and socket of a successor daemon", async () => {
      if (process.platform === "win32") return;
      const { registry } = setup.cur;
      const { daemon, socketPath } = await startDaemon();

      await fs.rm(socketPath);
      await fs.writeFile(socketPath, "");
      const entry = await registry.readEntry("default");
      always(entry);
      await registry.writeEntry({ ...entry, pid: process.pid + 1 });

      daemon.removeOwnedFilesSync();

      expect(await registry.readEntry("default")).toMatchObject({
        pid: process.pid + 1,
      });
      await expect(fs.stat(socketPath)).resolves.toBeDefined();
      await fs.rm(socketPath, { force: true });
    });

    it("keeps files of a live daemon when its own start failed", async () => {
      if (process.platform === "win32") return;
      const { registry, start, stop, onExit } = setup.cur;
      const socketPath = registry.socketPath("default");
      // Another live daemon owns the session.
      await registry.writeEntry({
        name: "default",
        version: "1.0.0",
        pid: process.pid + 1,
        socketPath,
        driverId: "other",
        platform: "chrome",
        startedAt: 1,
        startOutput: "{}",
      });
      const failing = new CliSessionDaemon({
        session: "default",
        registry,
        start,
        startInput: {},
        stop,
        tools: {},
        idleTimeoutMs: 0,
        onExit,
      });
      const listen = vi
        .spyOn(net.Server.prototype, "listen")
        .mockImplementationOnce(function (this: net.Server) {
          fsSync.writeFileSync(socketPath, "");
          queueMicrotask(() => this.emit("error", new Error("EADDRINUSE")));
          return this;
        });
      pushMock(listen);
      pushTeardown(() => fs.rm(socketPath, { force: true }));

      await expect(failing.start()).rejects.toThrow("EADDRINUSE");
      failing.removeOwnedFilesSync();

      expect(await registry.readEntry("default")).toMatchObject({
        pid: process.pid + 1,
      });
      await expect(fs.stat(socketPath)).resolves.toBeDefined();
    });
  });

  it("stops once when terminated while a stop request is queued", async () => {
    const { echo, stop, onExit } = setup.cur;
    const gate = Promise.withResolvers<void>();
    echo.mockImplementation(async (input) => {
      await gate.promise;
      return output(input);
    });
    const { daemon, socketPath } = await startDaemon();

    const parsed = spyOnParsedRequests();
    const running = request(socketPath, run(1, "echo", {}));
    await vi.waitFor(() => expect(echo).toHaveBeenCalled());
    const stopping = request(socketPath, {
      id: 2,
      method: "stop",
      params: { saveCache: false },
    });
    await vi.waitFor(() =>
      expect(parsed).toHaveBeenCalledWith(
        expect.objectContaining({ method: "stop" }),
      ),
    );
    const terminating = daemon.terminate(true);
    gate.resolve();

    expect(await running).toMatchObject({ id: 1, result: {} });
    expect(await stopping).toEqual({
      id: 2,
      result: { text: JSON.stringify({ stopped: "drv-1" }) },
    });
    await terminating;
    expect(stop).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledWith(0);
  });

  it("rejects requests queued behind a stop", async () => {
    const { echo, stop } = setup.cur;
    const gate = Promise.withResolvers<void>();
    echo.mockImplementation(async (input) => {
      await gate.promise;
      return output(input);
    });
    const { socketPath } = await startDaemon();

    const parsed = spyOnParsedRequests();
    const running = request(socketPath, run(1, "echo", {}));
    await vi.waitFor(() => expect(echo).toHaveBeenCalled());
    const stopping = request(socketPath, {
      id: 2,
      method: "stop",
      params: { saveCache: false },
    });
    await vi.waitFor(() =>
      expect(parsed).toHaveBeenCalledWith(
        expect.objectContaining({ method: "stop" }),
      ),
    );
    const late = request(socketPath, run(3, "echo", {}));
    await vi.waitFor(() =>
      expect(parsed).toHaveBeenCalledWith(expect.objectContaining({ id: 3 })),
    );
    gate.resolve();

    await running;
    await stopping;
    expect(await late).toEqual({
      id: 3,
      error:
        "Session 'default' is not running. Run `alumnium cli start` first.",
    });
    expect(echo).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("closes the connection on a malformed request and keeps serving", async () => {
    const { echo } = setup.cur;
    const { socketPath } = await startDaemon();

    const connection = new SocketConnection(net.createConnection(socketPath));
    const onmessage = vi.fn();
    const onclose = vi.fn();
    connection.onmessage = onmessage;
    connection.onclose = onclose;
    await connection.send({ id: 1, method: "nope" });

    await vi.waitFor(() => expect(onclose).toHaveBeenCalled());
    expect(onmessage).not.toHaveBeenCalled();
    expect(echo).not.toHaveBeenCalled();
    expect(await request(socketPath, run(2, "echo", {}))).toMatchObject({
      id: 2,
      result: {},
    });
  });

  it("reports a failing stop and exits with 1", async () => {
    const { stop, onExit } = setup.cur;
    stop.mockRejectedValueOnce(new Error("stop failed"));
    const { socketPath } = await startDaemon();

    expect(
      await request(socketPath, {
        id: 1,
        method: "stop",
        params: { saveCache: false },
      }),
    ).toEqual({ id: 1, error: "stop failed" });

    await vi.waitFor(() => expect(onExit).toHaveBeenCalledWith(1));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("retries a failed cache-saving stop without the cache", async () => {
    const { stop } = setup.cur;
    stop.mockRejectedValueOnce(new Error("cache save failed"));
    const { socketPath } = await startDaemon();

    expect(
      await request(socketPath, {
        id: 1,
        method: "stop",
        params: { saveCache: true },
      }),
    ).toEqual({ id: 1, error: "cache save failed" });

    expect(stop).toHaveBeenCalledTimes(2);
    expect(stop).toHaveBeenNthCalledWith(1, { id: "drv-1", save_cache: true });
    expect(stop).toHaveBeenNthCalledWith(2, { id: "drv-1", save_cache: false });
  });

  // NOTE: Vitest workers can't change the umask, so this relies on the
  // ambient one (typically 022, which would yield 0755 without the chmod).
  it.skipIf(process.platform === "win32")(
    "restricts the socket to its owner",
    async () => {
      const { socketPath } = await startDaemon();
      expect((fsSync.statSync(socketPath).mode & 0o777).toString(8)).toBe(
        "600",
      );
    },
  );

  it("rejects inherited object keys as tools", async () => {
    const { socketPath } = await startDaemon();

    expect(await request(socketPath, run(1, "constructor", {}))).toEqual({
      id: 1,
      error: "Unknown tool: constructor",
    });
  });

  it("survives server errors after listening", async () => {
    let server: net.Server | undefined;
    const listen = net.Server.prototype.listen;
    const spy = vi
      .spyOn(net.Server.prototype, "listen")
      .mockImplementationOnce(function (this: net.Server, ...args) {
        server = this;
        return listen.apply(this, args as Parameters<net.Server["listen"]>);
      });
    pushMock(spy);
    await startDaemon();
    always(server);
    // NOTE: Keeps the logged errors out of the test output.
    pushMock(vi.spyOn(console, "error").mockImplementation(() => {}));

    expect(() => {
      server?.emit("error", new Error("boom 1"));
      server?.emit("error", new Error("boom 2"));
    }).not.toThrow();
    expect(server.listenerCount("error")).toBe(1);
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
