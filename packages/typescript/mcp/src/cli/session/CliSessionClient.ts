import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import z from "zod";
import {
  ALUMNIUM_VERSION,
  Env,
  ensureDir,
  isSingleFileExecutable,
  sleep,
} from "@alumnium/core/internal";
import { CliProtocol } from "./CliProtocol.ts";
import { CliSessionRegistry } from "./CliSessionRegistry.ts";
import { SocketConnection } from "./SocketConnection.ts";

const START_POLL_INTERVAL_MS = 200;

export namespace CliSessionClient {
  export interface StartProps {
    capabilities: string;
    serverUrl?: string | undefined;
  }

  export interface ListedSession extends CliSessionRegistry.Entry {
    status: "running" | "stale";
  }
}

/**
 * Sends one request per invocation to a session daemon.
 *
 * NOTE: It must never log, the CLI stdout is reserved for tool output.
 */
export class CliSessionClient {
  #registry: CliSessionRegistry;
  #startTimeoutMs: number;
  #pollIntervalMs: number;

  constructor(
    registry = new CliSessionRegistry(),
    startTimeoutMs = Env.ALUMNIUM_CLI_START_TIMEOUT * 1000,
    pollIntervalMs = START_POLL_INTERVAL_MS,
  ) {
    this.#registry = registry;
    this.#startTimeoutMs = startTimeoutMs;
    this.#pollIntervalMs = pollIntervalMs;
  }

  run(
    session: string,
    tool: string,
    input: Record<string, unknown>,
  ): Promise<string> {
    return this.#request(
      session,
      { id: 1, method: "run", params: { tool, input } },
      true,
    );
  }

  stop(session: string, saveCache: boolean): Promise<string> {
    return this.#request(
      session,
      { id: 1, method: "stop", params: { saveCache } },
      false,
    );
  }

  async list(): Promise<CliSessionClient.ListedSession[]> {
    const entries = await this.#registry.listEntries();
    return Promise.all(
      entries.map(async (entry) => {
        const running = await canConnect(entry.socketPath);
        if (!running) await this.#registry.removeEntry(entry.name);
        return { ...entry, status: running ? "running" : "stale" } as const;
      }),
    );
  }

  async start(
    session: string,
    props: CliSessionClient.StartProps,
  ): Promise<string> {
    const entry = await this.#registry.readEntry(session);
    if (entry) {
      if (await canConnect(entry.socketPath))
        throw new Error(
          `Session '${session}' is already running (pid ${entry.pid}). Run \`${cliCommandLine(session, "stop")}\` first.`,
        );
      await this.#registry.removeEntry(session);
    }

    return spawnDaemon(this.#registry, session, props, {
      timeoutMs: this.#startTimeoutMs,
      pollIntervalMs: this.#pollIntervalMs,
    });
  }

  async #request(
    session: string,
    request: CliProtocol.Request,
    checkVersion: boolean,
  ): Promise<string> {
    const entry = await this.#registry.readEntry(session);
    if (!entry) throw notRunningError(session);

    const socket = await connect(entry.socketPath);
    if (!socket) {
      await this.#registry.removeEntry(session);
      throw notRunningError(session);
    }

    // NOTE: Checked after liveness, a dead session is "not running" whatever
    // its version, and `stop` would say the same.
    if (checkVersion && entry.version !== ALUMNIUM_VERSION) {
      socket.destroy();
      throw new Error(
        `Session '${session}' was started by alumnium v${entry.version}, this is v${ALUMNIUM_VERSION}. Run \`${cliCommandLine(session, "stop")}\`, then \`${cliCommandLine(session, "start")}\`.`,
      );
    }

    return sendRequest(session, socket, request);
  }
}

export function cliCommandLine(session: string, subcommand: string): string {
  return `alumnium cli ${subcommand}${session === "default" ? "" : ` -s ${session}`}`;
}

function notRunningError(session: string): Error {
  return new Error(
    `Session '${session}' is not running. Run \`${cliCommandLine(session, "start")}\` first.`,
  );
}

/**
 * Resolves to `undefined` when the errors prove that nobody listens on the
 * socket. Any other error (e.g. EMFILE, EACCES) says nothing about the
 * session, so it is thrown.
 */
function connect(socketPath: string): Promise<net.Socket | undefined> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath, () => resolve(socket));
    socket.once("error", (error: NodeJS.ErrnoException) =>
      error.code === "ECONNREFUSED" || error.code === "ENOENT"
        ? resolve(undefined)
        : reject(error),
    );
  });
}

async function canConnect(socketPath: string): Promise<boolean> {
  const socket = await connect(socketPath);
  socket?.destroy();
  return !!socket;
}

function sendRequest(
  session: string,
  socket: net.Socket,
  request: CliProtocol.Request,
): Promise<string> {
  // NOTE: The line limit protects the daemon from requests, not the client
  // from replies like a large accessibility tree.
  const connection = new SocketConnection(socket, Infinity);
  return new Promise((resolve, reject) => {
    connection.onmessage = (message) => {
      connection.close();
      const response = CliProtocol.Response.safeParse(message);
      if (!response.success)
        reject(new Error(`Session '${session}' sent an invalid response`));
      else if ("error" in response.data) reject(new Error(response.data.error));
      else resolve(response.data.result.text);
    };
    // NOTE: No-op if the response already settled the promise.
    const closed = () =>
      reject(new Error(`Session '${session}' closed unexpectedly`));
    connection.onclose = closed;
    // NOTE: A write error (EPIPE) means the daemon went away.
    connection.send(request).catch(closed);
  });
}

/**
 * Spawns the daemon like `ServerCommand.startDaemon`: its stdout/stderr go to
 * a log file (never a pipe, so later output can't fail with EPIPE) and
 * readiness is detected by polling the registry.
 */
async function spawnDaemon(
  registry: CliSessionRegistry,
  session: string,
  props: CliSessionClient.StartProps,
  { timeoutMs, pollIntervalMs }: { timeoutMs: number; pollIntervalMs: number },
): Promise<string> {
  await ensureDir(registry.dir);
  const logPath = registry.logPath(session);
  const log = fs.openSync(logPath, "w");

  const args = [
    // NOTE: In development, the first argument is the bin.ts script path.
    ...(isSingleFileExecutable() ? [] : process.argv.slice(1, 2)),
    "cli",
    "start",
  ];

  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: ["ignore", log, log],
    windowsHide: true,
    env: {
      // oxlint-disable-next-line no-process-env -- We need it to pass env vars
      ...process.env,
      ALUMNIUM_CLI_DAEMONIZE: z.stringbool().encode(true),
      // NOTE: Not a `--session` argument, cac would cast `007` to the number 7.
      ALUMNIUM_CLI_SESSION: session,
      // NOTE: Not argv, it would expose them in the process list.
      ALUMNIUM_CLI_START_CAPABILITIES: props.capabilities,
      ...(props.serverUrl && {
        ALUMNIUM_CLI_START_SERVER_URL: props.serverUrl,
      }),
    },
  });
  fs.closeSync(log);
  const exited = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve) =>
    child.once("exit", (code, signal) => resolve({ code, signal })),
  );
  const failed = new Promise<Error>((resolve) => child.once("error", resolve));
  child.unref();

  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const entry = await registry.readEntry(session);
    if (
      entry &&
      entry.pid === child.pid &&
      (await canConnect(entry.socketPath))
    )
      return entry.startOutput;

    const remaining = deadline - Date.now();
    const result = await Promise.race([
      exited,
      failed,
      sleep(Math.max(0, Math.min(pollIntervalMs, remaining))),
    ]);
    if (result instanceof Error)
      throw new Error(
        `Session '${session}' failed to start: ${result.message}`,
      );
    if (result !== undefined) {
      const reason =
        result.code !== null
          ? `exit code ${result.code}`
          : `killed by ${result.signal}`;
      throw new Error(
        `Session '${session}' failed to start (${reason})${readLog(logPath)}`,
      );
    }
    if (Date.now() >= deadline) {
      child.kill();
      throw new Error(
        `Session '${session}' did not start within ${Math.round(timeoutMs / 1000)} seconds${readLog(logPath)}`,
      );
    }
  }
}

function readLog(logPath: string): string {
  const logText = fs.readFileSync(logPath, "utf-8").trim();
  return logText ? `:\n${logText}` : "";
}
