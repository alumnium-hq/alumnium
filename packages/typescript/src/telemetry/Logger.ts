import { getFileSink } from "@logtape/file";
import {
  ansiColorFormatter,
  configure,
  getConsoleSink,
  getLogger as logtapeGetLogger,
  type Config as LogtapeConfig,
  type Sink,
} from "@logtape/logtape";
import { getOpenTelemetrySink } from "@logtape/otel";
import * as fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { GlobalFileStorePaths } from "../FileStore/GlobalFileStorePaths.ts";
import { Telemetry } from "./Telemetry.ts";
import { Tracer } from "./Tracer.ts";

const PRUNE_LOGS = process.env.ALUMNIUM_PRUNE_LOGS !== "false";
const FILENAME = process.env.ALUMNIUM_LOG_FILENAME;
const PATH = process.env.ALUMNIUM_LOG_PATH;
const DEFAULT_LEVEL = process.env.ALUMNIUM_LOG_LEVEL?.toLowerCase().trim();
const DEBUG_EXTRA_STR = process.env.ALUMNIUM_LOG_DEBUG_EXTRA;

export namespace Logger {
  //#region Schemas

  export type Level = z.infer<typeof Logger.Level>;

  export type Method = z.infer<typeof Logger.Method>;

  export type DebugExtra = z.infer<typeof Logger.DebugExtra>;

  //#endregion

  //#region API

  export type Like = {
    [method in Method]: LikeMethodFn;
  };

  export type LikeMethodFn = (message: string, payload?: any) => void;

  export type BindMessageFn = (message: string) => string;

  //#endregion

  //#region Configuration

  export interface ConfigureProps {
    reset?: boolean | undefined;
    logPath?: string | Logger.PathObj | undefined;
  }

  export interface PathObj {
    filename?: string | undefined;
    path?: string | undefined;
  }

  //#endregion
}

export abstract class Logger {
  //#region Schemas

  static levels = [
    "debug",
    "error",
    "fatal",
    "info",
    "trace",
    "warning",
  ] as const;

  static Level = z.enum(Logger.levels).catch(() => "info" as const);

  static methods = [
    "debug",
    "error",
    "fatal",
    "info",
    "trace",
    "warn",
  ] as const;

  static Method = z.enum(Logger.methods);

  static DebugExtra = z.enum([
    "all",
    "langchain",
    "tree",
    "reasoning",
    "http",
    "scenarios",
  ]);

  //#endregion

  //#region API

  static get(moduleUrl: string): Logger.Like {
    return new Proxy({} as Logger.Like, {
      get: (_, prop) => {
        const methodResult = this.Method.safeParse(prop);
        if (!methodResult.success)
          throw new Error(`Invalid log method: ${String(prop)}`);
        const method = methodResult.data;

        return (...args: Parameters<Logger.LikeMethodFn>) => {
          void this.#get(moduleUrl).then((logger) => logger[method](...args));
        };
      },
    });
  }

  static #loggerPromise: Promise<Logger.Like> | undefined;

  static #get(moduleUrl: string): Promise<Logger.Like> {
    if (!this.#loggerPromise) this.#loggerPromise = this.#configure(moduleUrl);
    return this.#loggerPromise;
  }

  static bind(
    logger: Logger.Like,
    messageFn: Logger.BindMessageFn,
  ): Logger.Like {
    const boundLogger = Object.fromEntries(
      this.levels.map((level) => {
        const method: Logger.Method = level === "warning" ? "warn" : level;
        const methodFn: Logger.LikeMethodFn = (
          message: string,
          payload?: any,
        ) => logger[method](messageFn(message), payload);
        return [method, methodFn];
      }),
    );
    return boundLogger as Logger.Like;
  }

  //#endregion

  //#region Configuration

  static #level = this.Level.parse(DEFAULT_LEVEL);

  static set level(newLevel: Logger.Level) {
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
    if (this.#loggerPromise)
      throw new Error("Cannot set logger level, already configured");

    this.#path = this.#resolvePath(newLogPath);
  }

  static #resolvePath(
    propsOrPathStr?: string | Logger.PathObj,
  ): string | undefined {
    const props: Logger.PathObj =
      typeof propsOrPathStr === "string"
        ? { path: propsOrPathStr }
        : propsOrPathStr || {};

    const path = PATH || props.path;
    if (path) return path;

    const filename = FILENAME || props.filename;
    if (filename) return GlobalFileStorePaths.globalSubDir(`logs/${filename}`);
  }

  static async #configure(moduleUrl: string): Promise<Logger.Like> {
    const config = await this.#config();
    await configure(config);
    return logtapeGetLogger([
      Telemetry.serviceName,
      Telemetry.moduleUrlToName(moduleUrl),
    ]);
  }

  static async #config(): Promise<LogtapeConfig<string, string>> {
    if (this.#path) {
      await fs.mkdir(path.dirname(this.#path), { recursive: true });
      if (PRUNE_LOGS) await fs.rm(this.#path, { force: true });
    }

    const consoleSink = getConsoleSink({ formatter: ansiColorFormatter });
    const mainSinks: string[] = ["main"];

    const sinks: Record<string, Sink> = {
      console: consoleSink,
      main: this.#path ? getFileSink(this.#path) : consoleSink,
    };

    if (Tracer.enabled) {
      mainSinks.push("otel");

      sinks.otel = getOpenTelemetrySink({
        serviceName: Telemetry.serviceName,
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
          category: [Telemetry.serviceName],
          lowestLevel: Logger.#level,
          sinks: mainSinks,
        },
      ],
    };
  }

  //#endregion

  //#region Debug extra

  static #debugExtra: Logger.DebugExtra[] =
    this.#resolveDebugExtra(DEBUG_EXTRA_STR);

  static debugExtra<Type>(
    extra: Logger.DebugExtra,
    value: Type,
  ): Type | string {
    return this.#debugExtraEnabled(extra)
      ? value
      : `<DISABLED: USE ALUMNIUM_LOG_DEBUG_EXTRA="${extra}">`;
  }

  static #resolveDebugExtra(extraStr: string | undefined): Logger.DebugExtra[] {
    return (
      extraStr?.split(",").flatMap((s) => {
        const parsed = this.DebugExtra.safeParse(s.trim()).data;
        return parsed ? [parsed] : [];
      }) || []
    );
  }

  static #debugExtraEnabled(extra: Logger.DebugExtra) {
    return this.#debugExtra.includes(extra) || this.#debugExtra.includes("all");
  }

  //#endregion
}
