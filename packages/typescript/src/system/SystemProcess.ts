import { Logger } from "../telemetry/Logger.ts";
import { Tracer } from "../telemetry/Tracer.ts";

export abstract class SystemProcess {
  static async exit(code: number): Promise<never> {
    await Promise.all([Logger.flush(), Tracer.flush()]);
    process.exit(code);
  }
}
