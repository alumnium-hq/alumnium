import z from "zod";

export namespace LoggerSchema {
  export type Level = z.infer<typeof LoggerSchema.Level>;

  export type Method = z.infer<typeof LoggerSchema.Method>;

  export type DebugExtra = z.infer<typeof LoggerSchema.DebugExtra>;

  export type Like = {
    [method in LoggerSchema.Method]: LikeMethodFn;
  };

  export type LikeMethodFn = (message: string, payload?: any) => void;
}

export abstract class LoggerSchema {
  static levels = [
    "debug",
    "error",
    "fatal",
    "info",
    "trace",
    "warning",
  ] as const;

  static Level = z.enum(this.levels).default("info");

  static methods = [
    "debug",
    "error",
    "fatal",
    "info",
    "trace",
    "warn",
  ] as const;

  static Method = z.enum(this.methods);

  static DebugExtra = z.enum([
    "all",
    "langchain",
    "tree",
    "reasoning",
    "http",
    "scenarios",
    "env",
  ]);
}
