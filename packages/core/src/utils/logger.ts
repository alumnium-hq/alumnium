import { getFileSink } from "@logtape/file";
import {
  ansiColorFormatter,
  configureSync,
  getConsoleSink,
  LogLevel,
  getLogger as logtapeGetLogger,
} from "@logtape/logtape";
import { always } from "alwaysly";
import * as fs from "fs";
import path from "node:path";

let configurePromise: Promise<void> | null = null;
let configured = false;

/**
 * Configure the logging system based on environment variables:
 * - ALUMNIUM_LOG_LEVEL: Log level (debug, info, warning, error, fatal) - defaults to "info"
 * - ALUMNIUM_LOG_PATH: Output destination ("stdout" or file path) - defaults to "stdout"
 */
function configureLogging(): void {
  // TODO: Parse with Zod and warn if invalid.
  const lowestLevel =
    (process.env.ALUMNIUM_LOG_LEVEL?.toLowerCase() as LogLevel) || "info";

  const logPath = process.env.ALUMNIUM_LOG_PATH;
  if (logPath) {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
  }

  const console = getConsoleSink({ formatter: ansiColorFormatter });

  configureSync({
    sinks: {
      console,
      main: logPath ? getFileSink(logPath) : console,
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
        lowestLevel,
        sinks: ["main"],
      },
    ],
  });
}

export function getLogger(modulePath: string) {
  if (!configured) {
    configureLogging();
    configured = true;
  }
  return logtapeGetLogger(["alumnium", moduleUrlToLoggerCategory(modulePath)]);
}

const MODULE_PATH_RE = /(src|dist)\/(.+)\.ts/;

export function moduleUrlToLoggerCategory(moduleUrl: string): string {
  const matches = moduleUrl.match(MODULE_PATH_RE);
  always(matches?.[2]);
  return matches[2];
}
