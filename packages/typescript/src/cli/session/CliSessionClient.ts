import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import z from "zod";
import { isSingleFileExecutable } from "../../bundle.ts";
import { ALUMNIUM_VERSION } from "../../package.ts";
import { ensureDir } from "../../utils/fs.ts";
import { sleep } from "../../utils/timers.ts";
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

  constructor(registry = new CliSessionRegistry()) {
    this.#registry = registry;
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

    return spawnDaemon(this.#registry, session, props);
  }

  async #request(
    session: string,
    request: CliProtocol.Request,
    checkVersion: boolean,
  ): Promise<string> {
    const entry = await this.#registry.readEntry(session);
    if (!entry) throw notRunningError(session);

    if (checkVersion && entry.version !== ALUMNIUM_VERSION)
      throw new Error(
        `Session '${session}' was started by alumnium v${entry.version}, this is v${ALUMNIUM_VERSION}. Run \`${cliCommandLine(session, "stop")}\`, then \`${cliCommandLine(session, "start")}\`.`,
      );

    const socket = await connect(entry.socketPath);
    if (!socket) {
      await this.#registry.removeEntry(session);
      throw notRunningError(session);
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

function connect(socketPath: string): Promise<net.Socket | undefined> {
  return new Promise((resolve) => {
    const socket = net.createConnection(socketPath, () => resolve(socket));
    socket.once("error", () => resolve(undefined));
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
  const connection = new SocketConnection(socket);
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
): Promise<string> {
  await ensureDir(registry.dir);
  const logPath = registry.logPath(session);
  const log = fs.openSync(logPath, "w");

  const args = [
    // NOTE: In development, the first argument is the bin.ts script path.
    ...(isSingleFileExecutable() ? [] : process.argv.slice(1, 2)),
    "cli",
    "start",
    "--session",
    session,
    "--capabilities",
    props.capabilities,
    ...(props.serverUrl ? ["--server-url", props.serverUrl] : []),
  ];

  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: ["ignore", log, log],
    windowsHide: true,
    env: {
      // oxlint-disable-next-line no-process-env -- We need it to pass env vars
      ...process.env,
      ALUMNIUM_CLI_DAEMONIZE: z.stringbool().encode(true),
    },
  });
  fs.closeSync(log);
  const exited = new Promise<number | null>((resolve) =>
    child.once("exit", (code) => resolve(code)),
  );
  child.unref();

  for (;;) {
    const entry = await registry.readEntry(session);
    if (
      entry &&
      entry.pid === child.pid &&
      (await canConnect(entry.socketPath))
    )
      return entry.startOutput;

    const code = await Promise.race([exited, sleep(START_POLL_INTERVAL_MS)]);
    if (code !== undefined) {
      const logText = fs.readFileSync(logPath, "utf-8").trim();
      throw new Error(
        `Session '${session}' failed to start (exit code ${code})${logText ? `:\n${logText}` : ""}`,
      );
    }
  }
}
