import { getFileSink } from "@logtape/file";
import {
  ansiColorFormatter,
  configureSync,
  getConsoleSink,
  getLogger as logtapeGetLogger,
  resetSync,
} from "@logtape/logtape";
import { always } from "alwaysly";
import * as fs from "fs";
import path from "node:path";
import { z } from "zod";

export const logLevels = [
  "debug",
  "error",
  "fatal",
  "info",
  "trace",
  "warning",
] as const;

const LogLevel = z.enum(logLevels).catch(() => "info" as const);

export type LogLevel = z.infer<typeof LogLevel>;

export const logMethods = [
  "debug",
  "error",
  "fatal",
  "info",
  "trace",
  "warn",
] as const;

export type LogMethod = (typeof logMethods)[number];

export type LoggerLike = {
  [method in LogMethod]: LoggerMethod;
};

export type LoggerMethod = (message: string, payload?: any) => void;

let configured = false;
let level = LogLevel.parse(process.env.ALUMNIUM_LOG_LEVEL?.toLowerCase());

namespace configureLogging {
  export interface Props {
    reset?: boolean | undefined;
    logPath?: string | undefined;
  }
}

const PRUNE_LOGS = !!process.env.ALUMNIUM_PRUNE_LOGS;

/**
 * Configure the logging system based on environment variables:
 * - ALUMNIUM_LOG_LEVEL: Log level (debug, info, warning, error, fatal) - defaults to "info"
 * - ALUMNIUM_LOG_PATH: Output destination ("stdout" or file path) - defaults to "stdout"
 */
function configureLogging(props: configureLogging.Props = {}): void {
  const { reset, logPath } = props;
  if (configured) {
    if (reset) resetSync();
    else return;
  }

  if (logPath) {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    if (PRUNE_LOGS) fs.rmSync(logPath, { force: true });
  }

  const consoleSink = getConsoleSink({ formatter: ansiColorFormatter });

  configureSync({
    sinks: {
      console: consoleSink,
      main: logPath
        ? getFileSink(logPath, {
            // Don't wait to write logs to the file to help with debugging
            flushInterval: 0,
            bufferSize: 0,
          })
        : consoleSink,
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

export namespace bindLogger {
  export type MessageFn = (message: string) => string;
}

export function bindLogger(
  logger: ReturnType<typeof getLogger>,
  messageFn: bindLogger.MessageFn,
): LoggerLike {
  const boundLogger = Object.fromEntries(
    logLevels.map((level) => {
      const methodName: LogMethod = level === "warning" ? "warn" : level;
      const method: LoggerMethod = (message: string, payload?: any) =>
        logger[methodName](messageFn(message), payload);
      return [methodName, method];
    }),
  );
  return boundLogger as LoggerLike;
}
