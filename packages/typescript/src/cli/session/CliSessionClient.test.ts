import { always } from "alwaysly";
import net from "node:net";
import { describe, expect, it, vi } from "vitest";
import {
  createMockDir,
  pushTeardown,
  setupBeforeEach,
} from "../../../tests/unit/mocks.ts";
import type { McpTool } from "../../mcp/tools/McpTool.ts";
import { ALUMNIUM_VERSION } from "../../package.ts";
import { CliSessionClient, cliCommandLine } from "./CliSessionClient.ts";
import { CliSessionDaemon } from "./CliSessionDaemon.ts";
import { CliSessionRegistry } from "./CliSessionRegistry.ts";

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

  it("fails when the daemon closes the connection without a response", async () => {
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
