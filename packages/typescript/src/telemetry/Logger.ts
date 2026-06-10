import { getFileSink } from "@logtape/file";
import {
  ansiColorFormatter,
  configure,
  dispose,
  disposeSync,
  getConsoleSink,
  getLogger as logtapeGetLogger,
  type Config as LogtapeConfig,
  type Sink,
} from "@logtape/logtape";
import { getOpenTelemetrySink } from "@logtape/otel";
import * as fs from "node:fs/promises";
import path from "node:path";
import { Env } from "../Env.ts";
import { GlobalFileStorePaths } from "../FileStore/GlobalFileStorePaths.ts";
import { ensureDir } from "../utils/fs.ts";
import { Instrumentation } from "./Instrumentation.ts";
import { LoggerSchema } from "./LoggerSchema.ts";
import { Tracer } from "./Tracer.ts";

export namespace Logger {
  export type BindMessageFn = (message: string) => string;

  export interface ConfigureProps {
    reset?: boolean | undefined;
    logPath?: string | Logger.PathObj | undefined;
  }

  export interface PathObj {
    filename?: string | undefined;
    path?: string | undefined;
  }

  export type Sinks = Record<string, Sink>;
}

export abstract class Logger {
  //#region API

  static get(moduleUrl: string): LoggerSchema.Like {
    return new Proxy({} as LoggerSchema.Like, {
      get: (_, prop) => {
        const methodResult = LoggerSchema.Method.safeParse(prop);
        if (!methodResult.success)
          throw new Error(`Invalid log method: ${String(prop)}`);
        const method = methodResult.data;

        return (...args: Parameters<LoggerSchema.LikeMethodFn>) => {
          void this.#get(moduleUrl).then((logger) => logger[method](...args));
        };
      },
    });
  }

  static #loggerPromise: Promise<LoggerSchema.Like> | undefined;

  static #get(moduleUrl: string): Promise<LoggerSchema.Like> {
    if (!this.#loggerPromise) this.#loggerPromise = this.#configure(moduleUrl);
    return this.#loggerPromise;
  }

  static bind(
    logger: LoggerSchema.Like,
    messageFn: Logger.BindMessageFn,
  ): LoggerSchema.Like {
    const boundLogger = Object.fromEntries(
      LoggerSchema.levels.map((level) => {
        const method: LoggerSchema.Method =
          level === "warning" ? "warn" : level;
        const methodFn: LoggerSchema.LikeMethodFn = (
          message: string,
          payload?: any,
        ) => logger[method](messageFn(message), payload);
        return [method, methodFn];
      }),
    );
    return boundLogger as LoggerSchema.Like;
  }

  static async initEnv(logger?: LoggerSchema.Like): Promise<void> {
    const envLogger = logger || this.#logger();

    const { vars, valid } = Env.init(envLogger);
    envLogger.debug("Environment variables: {vars}", {
      vars: this.debugExtra("env", vars),
    });

    if (!valid) {
      await this.#flush();
      process.exit(1);
    }
  }

  //#endregion

  //#region Configuration

  static #level: LoggerSchema.Level | undefined;

  static set level(newLevel: LoggerSchema.Level) {
    // NOTE: Currently, we lock configuration changes as we evaluate
    // configuration lazily when first log method is called. It allows to reduce
    // complexity of reconfiguration when using `getLogger` in module scope.
    //
    // This can be solved, but probably shouldn't unless we find a strong case
    // for it.
    if (this.#loggerPromise)
      throw new Error("Cannot set logger level, already configured");

    this.#level = newLevel;
  }

  static #path = this.#resolvePath();

  static set path(newLogPath: string | Logger.PathObj) {
    // NOTE: See NOTE in `level`.
    if (this.#loggerPromise) {
      const message = `Cannot set logger path ${newLogPath}, the logger is already configured`;
      this.#logger().error(message);
      throw new Error(message);
    }

    this.#path = this.#resolvePath(newLogPath);
  }

  static #resolvePath(
    propsOrPathStr?: string | Logger.PathObj,
  ): string | undefined {
    const props: Logger.PathObj =
      typeof propsOrPathStr === "string"
        ? { path: propsOrPathStr }
        : propsOrPathStr || {};

    const path = Env.ALUMNIUM_LOG_PATH || props.path;
    if (path) return path;

    const filename = Env.ALUMNIUM_LOG_FILENAME || props.filename;
    if (filename) return GlobalFileStorePaths.globalSubDir(`logs/${filename}`);
  }

  static async #configure(moduleUrl: string): Promise<LoggerSchema.Like> {
    const config = await this.#config();
    await configure(config);
    return logtapeGetLogger([
      Instrumentation.serviceName,
      Instrumentation.moduleUrlToName(moduleUrl),
    ]);
  }

  static async #config(): Promise<LogtapeConfig<string, string>> {
    if (this.#path) {
      await ensureDir(path.dirname(this.#path));
      if (Env.ALUMNIUM_PRUNE_LOGS) await fs.rm(this.#path, { force: true });
    }

    const consoleSink = getConsoleSink({ formatter: ansiColorFormatter });
    const mainSinks: string[] = ["main"];
    const flushInterval = Env.ALUMNIUM_LOG_FLUSH_INTERVAL;

    const sinks: Logger.Sinks = {
      console: consoleSink,
      main: this.#path
        ? getFileSink(this.#path, {
            bufferSize: Env.ALUMNIUM_LOG_BUFFER_SIZE,
            flushInterval,
          })
        : consoleSink,
    };

    // NOTE: Wait for flush on process exit to ensure all logs are written.
    if (this.#path) {
      process.on("exit", () => {
        void this.#flush();
      });
    }

    if (Tracer.enabled) {
      mainSinks.push("otel");

      sinks.otel = getOpenTelemetrySink({
        serviceName: Instrumentation.serviceName,
      });
    }

    return {
      sinks,
      filters: {},
      loggers: [
        {
          category: ["logtape", "meta"],
          lowestLevel: "warning",
          sinks: ["console"],
        },
        {
          category: [Instrumentation.serviceName],
          lowestLevel: Logger.#level || Env.ALUMNIUM_LOG_LEVEL,
          sinks: mainSinks,
        },
      ],
    };
  }

  static #logger(): LoggerSchema.Like {
    return Logger.get(import.meta.url);
  }

  static async #flush() {
    await this.#loggerPromise;
    disposeSync();
    await dispose();
  }

  //#endregion

  //#region Debug extra

  static #debugExtra: LoggerSchema.DebugExtra[] = Env.ALUMNIUM_LOG_DEBUG_EXTRA;

  static debugExtra<Type>(
    extra: LoggerSchema.DebugExtra,
    value: Type,
  ): Type | string {
    return this.#debugExtraEnabled(extra)
      ? value
      : `<DISABLED: USE ALUMNIUM_LOG_DEBUG_EXTRA="${extra}">`;
  }

  static #debugExtraEnabled(extra: LoggerSchema.DebugExtra) {
    return this.#debugExtra.includes(extra) || this.#debugExtra.includes("all");
  }

  //#endregion
}
