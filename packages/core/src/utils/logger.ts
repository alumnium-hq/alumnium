import { getFileSink } from "@logtape/file";
import {
  ansiColorFormatter,
  configureSync,
  getConsoleSink,
  LogLevel,
  getLogger as logtapeGetLogger,
  resetSync,
} from "@logtape/logtape";
import { always } from "alwaysly";
import * as fs from "fs";
import path from "node:path";

let configured = false;
// TODO: Parse with Zod and warn if invalid.
let level =
  (process.env.ALUMNIUM_LOG_LEVEL?.toLowerCase() as LogLevel | undefined) ||
  "info";

/**
 * Configure the logging system based on environment variables:
 * - ALUMNIUM_LOG_LEVEL: Log level (debug, info, warning, error, fatal) - defaults to "info"
 * - ALUMNIUM_LOG_PATH: Output destination ("stdout" or file path) - defaults to "stdout"
 */
function configureLogging(reset?: boolean): void {
  if (configured) {
    if (reset) resetSync();
    else return;
  }

  const logPath = process.env.ALUMNIUM_LOG_PATH;
  if (logPath) {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
  }

  const consoleSink = getConsoleSink({ formatter: ansiColorFormatter });

  configureSync({
    sinks: {
      console: consoleSink,
      main: logPath ? getFileSink(logPath) : consoleSink,
    },
    filters: {},
    loggers: [
      {
        category: ["logtape", "meta"],
        lowestLevel: "warning",
        sinks: ["console"],
      },
      {
        category: ["alumnium"],
        lowestLevel: level,
        sinks: ["main"],
      },
    ],
  });
  configured = true;
}

export function setLoggerLevel(newLevel: LogLevel) {
  level = newLevel;
  configureLogging(true);
}

export function getLogger(modulePath: string) {
  configureLogging();

  return logtapeGetLogger(["alumnium", moduleUrlToLoggerCategory(modulePath)]);
}

const MODULE_PATH_RE = /(src|dist)\/(.+)\.ts/;

export function moduleUrlToLoggerCategory(moduleUrl: string): string {
  const matches = moduleUrl.match(MODULE_PATH_RE);
  always(matches?.[2]);
  return matches[2];
}
