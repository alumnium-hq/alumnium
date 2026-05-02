import { always } from "alwaysly";
import { snakeCase } from "case-anything";
import { Logger } from "./Logger.ts";
import { Tracer } from "./Tracer.ts";

const MODULE_URL_RE = /(src|dist)\/(.+)\.ts/;

export namespace Telemetry {
  export interface Like {
    tracer: Tracer.Like;
    logger: Logger.Like;
  }
}

export abstract class Telemetry {
  static readonly serviceName = "alumnium";

  static moduleUrlToName(moduleUrl: string): string {
    const matches = moduleUrl.match(MODULE_URL_RE);
    always(matches?.[2]);
    const parts = matches[2].split("/").map((part) => snakeCase(part));
    return parts.join(".");
  }

  static get(moduleUrl: string): Telemetry.Like {
    const tracer = Tracer.get(moduleUrl);
    const logger = Logger.get(moduleUrl);
    return { tracer, logger };
  }
}
