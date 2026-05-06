import { Logger } from "./Logger.ts";
import type { LoggerSchema } from "./LoggerSchema.ts";
import { Tracer } from "./Tracer.ts";

export namespace Telemetry {
  export interface Like {
    tracer: Tracer.Like;
    logger: LoggerSchema.Like;
  }
}

export abstract class Telemetry {
  static get(moduleUrl: string): Telemetry.Like {
    const tracer = Tracer.get(moduleUrl);
    const logger = Logger.get(moduleUrl);
    return { tracer, logger };
  }
}
