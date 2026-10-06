import { always } from "alwaysly";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import net from "node:net";
import { describe, expect, it, vi } from "vitest";
import {
  createMockDir,
  pushMock,
  pushTeardown,
  setupBeforeEach,
} from "../../../../alumnium/tests/unit/mocks.ts";
import { ALUMNIUM_VERSION } from "@alumnium/core/internal";
import type { McpTool } from "../../mcp/tools/McpTool.ts";
import { CliSessionClient, cliCommandLine } from "./CliSessionClient.ts";
import { CliSessionDaemon } from "./CliSessionDaemon.ts";
import { CliSessionRegistry } from "./CliSessionRegistry.ts";

const spawnMock = vi.hoisted(() => vi.fn());
const connectionArgs = vi.hoisted(() => [] as unknown[][]);

vi.mock("./SocketConnection.ts", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("./SocketConnection.ts")>();
  return {
    SocketConnection: class extends original.SocketConnection {
      constructor(
        ...args: ConstructorParameters<typeof original.SocketConnection>
      ) {
        super(...args);
        connectionArgs.push(args);
      }
    },
  };
});

vi.mock("node:child_process", () => ({ spawn: spawnMock }));

describe("CliSessionClient", () => {
  const setup = setupBeforeEach(async () => {
    const dir = await createMockDir();
    const registry = new CliSessionRegistry(dir.path);
    return {
      registry,
      client: new CliSessionClient(registry),
      stop: vi.fn(async (input: Record<string, unknown>) =>
        output({ stopped: input.id }),
      ),
      echo: vi.fn(async (input: Record<string, unknown>) => output(input)),
    };
  });

  async function startDaemon(session = "default") {
    const { registry, stop, echo } = setup.cur;
    const daemon = new CliSessionDaemon({
      session,
      registry,
      start: async () =>
        output({ id: `drv-${session}`, platform_name: "chrome" }),
      startInput: {},
      stop,
      tools: { echo },
      idleTimeoutMs: 0,
      onExit: () => {},
    });
    pushTeardown(() => daemon.terminate(false));
    await daemon.start();
  }

  it("runs a tool on a running session", async () => {
    const { client } = setup.cur;
    await startDaemon();

    const text = await client.run("default", "echo", { goal: "x" });

    expect(JSON.parse(text)).toEqual({ goal: "x", id: "drv-default" });
  });

  it("reads replies without a line limit", async () => {
    const { client } = setup.cur;
    await startDaemon();
    connectionArgs.length = 0;

    await client.run("default", "echo", {});

    // NOTE: The daemon's connections keep the default limit, the client's
    // is Infinity, so big replies aren't cut off.
    expect(
      connectionArgs.filter(([, limit]) => limit === Infinity),
    ).toHaveLength(1);
  });

  it("returns large outputs in full", async () => {
    const { client, echo } = setup.cur;
    const tree = "<node/>".repeat(150_000);
    echo.mockResolvedValueOnce([{ type: "text", text: tree }]);
    await startDaemon();

    expect(await client.run("default", "echo", {})).toBe(tree);
  });

  it("reports sessions that are not running", async () => {
    const { client } = setup.cur;

    await expect(client.run("default", "echo", {})).rejects.toThrow(
      "Session 'default' is not running. Run `alumnium cli start` first.",
    );
    await expect(client.stop("work", false)).rejects.toThrow(
      "Session 'work' is not running. Run `alumnium cli start -s work` first.",
    );
  });

  it("cleans up stale sessions", async () => {
    const { client, registry } = setup.cur;
    await registry.writeEntry(entry(registry, "old"));

    await expect(client.run("old", "echo", {})).rejects.toThrow(
      "Session 'old' is not running",
    );
    expect(await registry.readEntry("old")).toBeUndefined();
  });

  it("fails when the daemon dies after reading the request", async () => {
    const { client, registry } = setup.cur;
    const server = net.createServer((socket) =>
      socket.once("data", () => socket.destroy()),
    );
    await new Promise<void>((resolve) =>
      server.listen(registry.socketPath("broken"), resolve),
    );
    pushTeardown(() => {
      server.close();
    });
    await registry.writeEntry(entry(registry, "broken"));

    await expect(client.run("broken", "echo", {})).rejects.toThrow(
      "Session 'broken' closed unexpectedly",
    );
  });

  it("fails when the daemon closes the connection on connect", async () => {
    const { client, registry } = setup.cur;
    const server = net.createServer((socket) => socket.destroy());
    await new Promise<void>((resolve) =>
      server.listen(registry.socketPath("broken"), resolve),
    );
    pushTeardown(() => {
      server.close();
    });
    await registry.writeEntry(entry(registry, "broken"));

    await expect(client.run("broken", "echo", {})).rejects.toThrow(
      "Session 'broken' closed unexpectedly",
    );
  });

  it("refuses to run tools on a session from another version", async () => {
    const { client, registry } = setup.cur;
    await startDaemon();
    const current = await registry.readEntry("default");
    always(current);
    await registry.writeEntry({ ...current, version: "0.0.0" });

    await expect(client.run("default", "echo", {})).rejects.toThrow(
      `Session 'default' was started by alumnium v0.0.0, this is v${ALUMNIUM_VERSION}. Run \`alumnium cli stop\`, then \`alumnium cli start\`.`,
    );
    expect(JSON.parse(await client.stop("default", false))).toEqual({
      stopped: "drv-default",
    });
  });

  it("reports a dead session from another version as not running", async () => {
    const { client, registry } = setup.cur;
    await registry.writeEntry({ ...entry(registry, "old"), version: "0.0.0" });

    await expect(client.run("old", "echo", {})).rejects.toThrow(
      "Session 'old' is not running",
    );
    expect(await registry.readEntry("old")).toBeUndefined();
  });

  it("stops a session", async () => {
    const { client, registry, stop } = setup.cur;
    await startDaemon();

    const text = await client.stop("default", true);

    expect(JSON.parse(text)).toEqual({ stopped: "drv-default" });
    expect(stop).toHaveBeenCalledWith({ id: "drv-default", save_cache: true });
    expect(await registry.readEntry("default")).toBeUndefined();
  });

  it("refuses to start a session that is already running", async () => {
    const { client } = setup.cur;
    await startDaemon();

    await expect(
      client.start("default", { capabilities: "{}" }),
    ).rejects.toThrow(
      `Session 'default' is already running (pid ${process.pid}). Run \`alumnium cli stop\` first.`,
    );
  });

  it("lists running and stale sessions and drops stale ones", async () => {
    const { client, registry } = setup.cur;
    await startDaemon("default");
    await registry.writeEntry(entry(registry, "old"));

    const sessions = await client.list();

    expect(
      sessions
        .map(({ name, status }) => ({ name, status }))
        .toSorted((a, b) => a.name.localeCompare(b.name)),
    ).toEqual([
      { name: "default", status: "running" },
      { name: "old", status: "stale" },
    ]);
    expect(await registry.readEntry("old")).toBeUndefined();
  });

  it("removes mismatched entry files but nothing outside the registry dir", async () => {
    const dir = await createMockDir();
    const registry = new CliSessionRegistry(`${dir.path}/cli/nested`);
    const client = new CliSessionClient(registry);
    await fs.mkdir(registry.dir, { recursive: true });
    const victim = `${dir.path}/victim.json`;
    await fs.writeFile(victim, "keep");
    await fs.writeFile(
      registry.resolve("a.json"),
      JSON.stringify({ ...entry(registry, "a"), name: "../../victim" }),
    );
    await fs.writeFile(registry.resolve("b.json"), "keep");
    await fs.writeFile(
      registry.resolve("c.json"),
      JSON.stringify(entry(registry, "b")),
    );

    expect(await client.list()).toEqual([]);

    expect(await fs.readFile(victim, "utf-8")).toBe("keep");
    expect(await fs.readdir(registry.dir)).toEqual([]);
  });

  it.each(["EMFILE", "EACCES"])(
    "surfaces %s connect errors without removing the session",
    async (code) => {
      const { client, registry } = setup.cur;
      await registry.writeEntry(entry(registry, "busy"));
      const socketPath = registry.socketPath("busy");
      await fs.writeFile(socketPath, "");
      pushTeardown(() => fs.rm(socketPath, { force: true }));
      vi.spyOn(net, "createConnection").mockImplementation(() => {
        const socket = Object.assign(new EventEmitter(), {
          destroy: vi.fn(),
        });
        queueMicrotask(() =>
          socket.emit("error", Object.assign(new Error(code), { code })),
        );
        return socket as unknown as net.Socket;
      });
      pushTeardown(() => {
        vi.restoreAllMocks();
      });

      await expect(client.run("busy", "echo", {})).rejects.toThrow(code);
      await expect(client.list()).rejects.toThrow(code);
      await expect(
        client.start("busy", { capabilities: "{}" }),
      ).rejects.toThrow(code);

      expect(await registry.readEntry("busy")).toBeDefined();
      await expect(fs.stat(socketPath)).resolves.toBeDefined();
    },
  );

  it("treats a missing socket as a dead session", async () => {
    const { client, registry } = setup.cur;
    await registry.writeEntry(entry(registry, "gone"));

    await expect(client.run("gone", "echo", {})).rejects.toThrow(
      "is not running",
    );
    expect(await registry.readEntry("gone")).toBeUndefined();
  });

  describe("start", () => {
    function fakeChild() {
      return Object.assign(new EventEmitter(), {
        pid: 424_242,
        kill: vi.fn(),
        unref: vi.fn(),
      });
    }

    it("fails when the daemon cannot be spawned", async () => {
      const { registry } = setup.cur;
      const child = fakeChild();
      spawnMock.mockImplementation(() => {
        queueMicrotask(() => child.emit("error", new Error("spawn ENOENT")));
        return child;
      });
      pushMock(spawnMock);

      await expect(
        new CliSessionClient(registry).start("default", { capabilities: "{}" }),
      ).rejects.toThrow("Session 'default' failed to start: spawn ENOENT");
    });

    it("reports the signal when the daemon is killed", async () => {
      const { registry } = setup.cur;
      const child = fakeChild();
      spawnMock.mockImplementation(() => {
        queueMicrotask(() => child.emit("exit", null, "SIGKILL"));
        return child;
      });
      pushMock(spawnMock);

      await expect(
        new CliSessionClient(registry).start("default", {
          capabilities: "{}",
        }),
      ).rejects.toThrow("failed to start (killed by SIGKILL)");
    });

    it("does not overshoot the start deadline", async () => {
      const { registry } = setup.cur;
      spawnMock.mockReturnValue(fakeChild());
      pushMock(spawnMock);

      const startedAt = Date.now();
      await expect(
        // NOTE: The poll interval is far above the deadline and the assertion,
        // so waiting a whole interval after the deadline would fail it.
        new CliSessionClient(registry, 30, 2_000).start("default", {
          capabilities: "{}",
        }),
      ).rejects.toThrow("did not start within");

      expect(Date.now() - startedAt).toBeLessThan(1_000);
    });

    it("passes capabilities and the server URL through env, not argv", async () => {
      const { registry } = setup.cur;
      spawnMock.mockReturnValue(fakeChild());
      pushMock(spawnMock);

      await expect(
        new CliSessionClient(registry, 1).start("default", {
          capabilities: '{"platformName":"chrome"}',
          serverUrl: "http://secret.example",
        }),
      ).rejects.toThrow("did not start within");

      const [, args, options] = spawnMock.mock.calls[0] ?? [];
      expect(args).not.toContain("--capabilities");
      expect(args).not.toContain("--server-url");
      expect(JSON.stringify(args)).not.toContain("secret.example");
      expect(JSON.stringify(args)).not.toContain("platformName");
      expect(options.env).toMatchObject({
        ALUMNIUM_CLI_START_CAPABILITIES: '{"platformName":"chrome"}',
        ALUMNIUM_CLI_START_SERVER_URL: "http://secret.example",
      });
    });

    it("omits the server URL env var when there is none", async () => {
      const { registry } = setup.cur;
      spawnMock.mockReturnValue(fakeChild());
      pushMock(spawnMock);

      await expect(
        new CliSessionClient(registry, 1).start("default", {
          capabilities: "{}",
        }),
      ).rejects.toThrow("did not start within");

      const [, , options] = spawnMock.mock.calls[0] ?? [];
      expect(options.env).not.toHaveProperty("ALUMNIUM_CLI_START_SERVER_URL");
    });

    it("kills the daemon when it does not start in time", async () => {
      const { registry } = setup.cur;
      const child = fakeChild();
      spawnMock.mockReturnValue(child);
      pushMock(spawnMock);

      await expect(
        new CliSessionClient(registry, 300).start("default", {
          capabilities: "{}",
        }),
      ).rejects.toThrow("Session 'default' did not start within");
      expect(child.kill).toHaveBeenCalled();
    });
  });

  it("formats command lines", () => {
    expect(cliCommandLine("default", "start")).toBe("alumnium cli start");
    expect(cliCommandLine("work", "stop")).toBe("alumnium cli stop -s work");
  });
});

function output(value: unknown): McpTool.Output {
  return [{ type: "text", text: JSON.stringify(value) }];
}

function entry(
  registry: CliSessionRegistry,
  name: string,
): CliSessionRegistry.Entry {
  return {
    name,
    version: ALUMNIUM_VERSION,
    pid: 999_999,
    socketPath: registry.socketPath(name),
    driverId: `drv-${name}`,
    platform: "chrome",
    startedAt: 1,
    startOutput: "{}",
  };
}
