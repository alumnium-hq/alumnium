import { getFileSink } from "@logtape/file";
import {
  configure,
  getConsoleSink,
  LogLevel,
  getLogger as logtapeGetLogger,
  type Sink,
} from "@logtape/logtape";
import { always } from "alwaysly";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

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

export function getLogger(modulePath: string) {
  if (!configurePromise) {
    configurePromise = configureLogging();
  }
  return logtapeGetLogger(moduleUrlToLoggerCategory(modulePath));
}

const MODULE_PATH_RE = /(src|dist)\/(.+)\.ts/;

export function moduleUrlToLoggerCategory(moduleUrl: string): string {
  const matches = moduleUrl.match(MODULE_PATH_RE);
  always(matches?.[2]);
  return matches[2];
}
