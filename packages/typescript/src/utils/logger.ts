import { getFileSink } from "@logtape/file";
import {
  getLogger as _getLogger,
  configure,
  getConsoleSink,
  type Sink,
} from "@logtape/logtape";

type LogLevel = "debug" | "info" | "warning" | "error" | "fatal";

let configured = false;

/**
 * Configure the logging system based on environment variables:
 * - ALUMNIUM_LOG_LEVEL: Log level (debug, info, warning, error, fatal) - defaults to "info"
 * - ALUMNIUM_LOG_PATH: Output destination ("stdout" or file path) - defaults to "stdout"
 */
async function configureLogging(): Promise<void> {
  if (configured) {
    return;
  }

  const logLevel =
    (process.env.ALUMNIUM_LOG_LEVEL?.toLowerCase() as LogLevel) || "warning";
  const logPath = process.env.ALUMNIUM_LOG_PATH || "stdout";

  const sinkKey = logPath === "stdout" ? "console" : "file";
  const sinks: Record<string, Sink> = {
    [sinkKey]: logPath === "stdout" ? getConsoleSink() : getFileSink(logPath),
  };

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

  configured = true;
}

export function getLogger(category: string[]) {
  if (!configured) {
    void configureLogging();
  }
  return _getLogger(["alumnium", ...category]);
}
