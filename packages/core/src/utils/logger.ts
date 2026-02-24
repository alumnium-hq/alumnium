import { getFileSink } from "@logtape/file";
import {
  getLogger as _getLogger,
  configure,
  getConsoleSink,
  type Sink,
} from "@logtape/logtape";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

type LogLevel = "debug" | "info" | "warning" | "error" | "fatal";

let configurePromise: Promise<void> | null = null;

/**
 * Configure the logging system based on environment variables:
 * - ALUMNIUM_LOG_LEVEL: Log level (debug, info, warning, error, fatal) - defaults to "info"
 * - ALUMNIUM_LOG_PATH: Output destination ("stdout" or file path) - defaults to "stdout"
 */
async function configureLogging(): Promise<void> {
  const logLevel =
    (process.env.ALUMNIUM_LOG_LEVEL?.toLowerCase() as LogLevel) || "warning";
  const logPath = process.env.ALUMNIUM_LOG_PATH || "stdout";

  const sinks: Record<string, Sink> = {};
  let sinkKey: string;
  if (logPath === "stdout") {
    sinkKey = "console";
    sinks[sinkKey] = getConsoleSink();
  } else {
    await mkdir(dirname(logPath), { recursive: true });
    sinkKey = "file";
    sinks[sinkKey] = getFileSink(logPath);
  }

  await configure({
    sinks,
    filters: {},
    loggers: [
      {
        category: ["alumnium"],
        lowestLevel: logLevel,
        sinks: [sinkKey],
      },
    ],
  });
}

export function getLogger(category: string[]) {
  if (!configurePromise) {
    configurePromise = configureLogging();
  }
  return _getLogger(["alumnium", ...category]);
}
