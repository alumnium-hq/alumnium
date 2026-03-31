import { spawn } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import z from "zod";
import { isBundled } from "../bundle.js";
import { CliCommand } from "../cli/CliCommand.js";
import { GlobalFileStorePaths } from "../FileStore/GlobalFileStorePaths.js";
import { getLogger, setLogPath } from "../utils/logger.js";
import { sleep } from "../utils/timers.js";
import { serverApp } from "./serverApp.js";

const logger = getLogger(import.meta.url);

const DEFAULT_SERVER_HOST = "127.0.0.1";
const DEFAULT_SERVER_PORT = 8013;
const DEFAULT_SERVER_TIMEOUT_MS = 15000;
const WAIT_POLL_INTERVAL_MS = 200;

export const ServerCommand = CliCommand.define({
  name: "server",
  description: "Run HTTP server",

  Args: z.object({
    host: z.string().default(DEFAULT_SERVER_HOST).register(CliCommand.option, {
      name: "host",
      syntax: "--host <host>",
      description: "Host to bind to",
    }),

    port: z.coerce
      .number()
      .int()
      .min(1, "Port number must be >= 1")
      .max(65535, "Port number must be <= 65535")
      .default(DEFAULT_SERVER_PORT)
      .register(CliCommand.option, {
        name: "port",
        syntax: "-p, --port <port>",
        description: "Port to bind to",
      }),

    daemon: z
      .union([z.boolean(), z.stringbool()])
      .default(false)
      .register(CliCommand.option, {
        name: "daemon",
        syntax: "-d, --daemon",
        description: "Run server as a daemon",
      }),

    kill: z
      .union([z.boolean(), z.stringbool()])
      .default(false)
      .register(CliCommand.option, {
        name: "kill",
        syntax: "-k, --kill",
        description: "Kill the running server",
      }),

    force: z
      .union([z.boolean(), z.stringbool()])
      .default(false)
      .register(CliCommand.option, {
        name: "force",
        syntax: "-f, --force",
        description: "Ignore server daemon status when killing or starting",
      }),

    waitFor: z
      .union([z.boolean(), z.stringbool()])
      .default(false)
      .register(CliCommand.option, {
        name: "wait-for",
        syntax: "--wait-for",
        description: "Wait for the server daemon to become healthy and exit",
      }),

    timeout: z.coerce
      .number()
      .int()
      .min(0, "Timeout must be a non-negative integer")
      .default(DEFAULT_SERVER_TIMEOUT_MS)
      .register(CliCommand.option, {
        name: "timeout",
        syntax: "--timeout <ms>",
        description: "Healthcheck timeout in milliseconds",
      }),
  }),

  action: async ({ args, logFilenameHint }) => {
    const { host, port, timeout, waitFor, daemon, kill, force } = args;
    const pidPath =
      process.env.ALUMNIUM_SERVER_PID_PATH ??
      GlobalFileStorePaths.globalSubDir("server.pid");

    if (kill) {
      await killDaemon(pidPath, null, force);
      process.exit(0);
    }

    if (daemon) {
      await startDaemon(pidPath, force);
      if (!waitFor) process.exit(0);
    }

    if (waitFor) {
      const deadline = Date.now() + timeout;
      const pid = await waitForPidFile(pidPath, deadline);
      if (pid == null) {
        logger.error(`Server PID file not found or invalid at ${pidPath}`);
        process.exit(1);
      }

      if (!isProcessRunning(pid)) {
        logger.error(`Server process ${pid} is not running`);
        await removePidFile(pidPath);
        process.exit(1);
      }

      const healthy = await waitForHealth(host, port, pid, deadline);
      if (!healthy) {
        logger.error(`Server health check timed out after ${timeout}ms`);
        process.exit(1);
      }
      logger.info(`Server is healthy at http://${host}:${port}/v1/health`);
      process.exit(0);
    }

    if (process.env.ALUMNIUM_SERVER_DAEMONIZE === "1") {
      setLogPath({ filename: logFilenameHint });

      await writePidFile(pidPath);

      const cleanup = removePidFileSync.bind(null, pidPath);
      process.on("exit", cleanup);
      process.on("SIGINT", () => {
        cleanup();
        process.exit(0);
      });
      process.on("SIGTERM", () => {
        cleanup();
        process.exit(0);
      });
    }

    logger.debug("Starting server");

    serverApp.listen({ hostname: host, port, reusePort: false }, (server) => {
      logger.info(`Started at http://${server.hostname}:${server.port}`);
    });
  },
});

async function startDaemon(pidPath: string, force: boolean): Promise<void> {
  const existingPid = await readPid(pidPath);
  const isExistingRunning = existingPid && isProcessRunning(existingPid);
  if (existingPid && isExistingRunning && !force) {
    logger.error(
      `Server is already running with PID ${existingPid} (${pidPath})`,
    );
    process.exit(1);
  }

  await killDaemon(pidPath, existingPid, true);

  const childArgs = process.argv.slice(isBundled() ? 2 : 1).filter((arg) => {
    if (arg === "--daemon" || arg === "-d") return false;
    if (arg === "--wait-for") return false;
    return true;
  });

  const child = spawn(process.execPath, childArgs, {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    env: {
      ...process.env,
      ALUMNIUM_SERVER_DAEMONIZE: "1",
    },
  });
  child.unref();

  logger.info(`Started daemon process ${child.pid}`);
}

async function killDaemon(
  pidPath: string,
  pidArg: number | null,
  force: boolean,
): Promise<void> {
  const pid = pidArg || (await readPid(pidPath));
  if (!pid) {
    if (force) return;
    logger.error(`Server PID file not found or invalid at ${pidPath}`);
    process.exit(1);
  }

  if (isProcessRunning(pid)) {
    process.kill(pid, "SIGTERM");
    logger.info(`Sent SIGTERM to server process ${pid}`);
    return sleep(1000); // Give it a moment to exit gracefully
  }

  if (!force)
    logger.warn(`Process ${pid} is not running, removing stale PID file`);
  await removePidFile(pidPath);
  if (!force) process.exit(1);
}

async function waitForPidFile(
  pidPath: string,
  deadline: number,
): Promise<number | null> {
  while (Date.now() < deadline) {
    const pid = await readPid(pidPath);
    if (pid != null) return pid;
    await Bun.sleep(WAIT_POLL_INTERVAL_MS);
  }
  return null;
}

async function waitForHealth(
  host: string,
  port: number,
  pid: number,
  deadline: number,
): Promise<boolean> {
  while (Date.now() < deadline) {
    if (!isProcessRunning(pid)) return false;
    try {
      const response = await fetch(`http://${host}:${port}/v1/health`);
      if (response.ok) return true;
    } catch {}
    await Bun.sleep(WAIT_POLL_INTERVAL_MS);
  }
  return false;
}

async function writePidFile(pidPath: string): Promise<void> {
  await fs.mkdir(path.dirname(pidPath), { recursive: true });
  await fs.writeFile(pidPath, String(process.pid), "utf-8");
}

async function removePidFile(pidPath: string): Promise<void> {
  await fs.rm(pidPath, { force: true }).catch(() => null);
}

function removePidFileSync(pidPath: string) {
  try {
    fsSync.rmSync(pidPath, { force: true });
  } catch {}
}

async function readPid(pidPath: string): Promise<number | null> {
  const pidStr = await fs.readFile(pidPath, "utf-8").catch(() => {});
  const pid = pidStr && parseInt(pidStr.trim());
  if (typeof pid !== "number" || Number.isNaN(pid)) return null;
  return pid;
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
