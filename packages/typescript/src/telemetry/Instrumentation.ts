import { always } from "alwaysly";
import { snakeCase } from "case-anything";

const MODULE_URL_RE = /(src|dist)\/(.+)\.ts/;

export abstract class Instrumentation {
  static readonly serviceName = "alumnium";

  static moduleUrlToName(moduleUrl: string): string {
    const matches = moduleUrl.match(MODULE_URL_RE);
    always(matches?.[2]);
    const parts = matches[2].split("/").map((part) => snakeCase(part));
    return parts.join(".");
  }
}
