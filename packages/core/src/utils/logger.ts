import { getFileSink } from "@logtape/file";
import {
  ansiColorFormatter,
  configureSync,
  getConsoleSink,
  type LogLevel,
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

namespace configureLogging {
  export interface Props {
    reset?: boolean | undefined;
    logPath?: string | undefined;
  }
}

/**
 * Configure the logging system based on environment variables:
 * - ALUMNIUM_LOG_LEVEL: Log level (debug, info, warning, error, fatal) - defaults to "info"
 * - ALUMNIUM_LOG_PATH: Output destination ("stdout" or file path) - defaults to "stdout"
 */
function configureLogging(props: configureLogging.Props = {}): void {
  if (configured) {
    if (props.reset) resetSync();
    else return;
  }

  const logPath = props.logPath ?? process.env.ALUMNIUM_LOG_PATH;
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
  configureLogging({ reset: true });
}

export function setLogPath(newLogPath: string) {
  configureLogging({ logPath: newLogPath, reset: true });
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
