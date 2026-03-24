import { spawn } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { isBundled } from "../bundle.js";
import { FileStore } from "../FileStore/FileStore.js";
import { getLogger, setLogPath } from "../utils/logger.js";
import { serverApp } from "./serverApp.js";

const logger = getLogger(import.meta.url);

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = "8013";
const DEFAULT_TIMEOUT_MS = "15000";
const WAIT_POLL_INTERVAL_MS = 200;

export async function serverCommand() {
  const { values } = parseArgs({
    args: Bun.argv,
    options: {
      port: {
        type: "string",
        default: DEFAULT_PORT,
        short: "p",
      },
      host: {
        type: "string",
        default: DEFAULT_HOST,
      },
      daemon: {
        type: "boolean",
        default: false,
        short: "d",
      },
      kill: {
        type: "boolean",
        default: false,
      },
      "wait-for": {
        type: "boolean",
        default: false,
      },
      timeout: {
        type: "string",
        default: DEFAULT_TIMEOUT_MS,
      },
    },
    allowPositionals: true,
  });

  const host = values.host || DEFAULT_HOST;
  const port = parseInt(values.port || DEFAULT_PORT);
  const timeout = parseInt(values.timeout || DEFAULT_TIMEOUT_MS);
  const waitFor = values["wait-for"];
  const pidPath =
    process.env.ALUMNIUM_SERVER_PID_PATH ??
    FileStore.globalSubDir("server.pid");

  if (values.kill) {
    const pid = await readPid(pidPath);
    if (!pid) {
      logger.error(`Server PID file not found or invalid at ${pidPath}`);
      process.exit(1);
    }
    if (!isProcessRunning(pid)) {
      logger.warn(`Process ${pid} is not running, removing stale PID file`);
      await removePidFile(pidPath);
      process.exit(1);
    }
    process.kill(pid, "SIGTERM");
    logger.info(`Sent SIGTERM to server process ${pid}`);
    process.exit(0);
  }

  if (values.daemon) {
    await startDaemon(pidPath);
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
    const logPath =
      process.env.ALUMNIUM_SERVER_DAEMON_LOG_PATH ||
      FileStore.globalSubDir(`server-${process.pid}.log`);
    setLogPath(logPath);

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
}

async function startDaemon(pidPath: string): Promise<void> {
  const existingPid = await readPid(pidPath);
  if (existingPid && isProcessRunning(existingPid)) {
    logger.error(
      `Server is already running with PID ${existingPid} (${pidPath})`,
    );
    process.exit(1);
  }

  if (existingPid) await removePidFile(pidPath);

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
    // NOTE: We wrap into try so that it doesn't throw when the server is not
    // yet accepting connections.
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
    // NOTE: Signal 0 only checks process existence/permissions and does not terminate it.
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
