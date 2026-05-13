import { Logger } from "../telemetry/Logger.ts";

export abstract class SystemProcess {
  static async exit(code: number): Promise<never> {
    await Logger.flush();
    process.exit(code);
  }
}
