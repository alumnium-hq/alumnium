import { always } from "alwaysly";
import { snakeCase } from "case-anything";

const MODULE_URL_RE = /(src|dist)\/(.+)\.ts/;
const TEST_MODULE_URL_RE = /(tests\/.+)\.ts/;

export abstract class Instrumentation {
  static readonly serviceName = "alumnium";

  static moduleUrlToName(moduleUrl: string): string {
    const pathMatch =
      moduleUrl.match(MODULE_URL_RE)?.[2] ||
      moduleUrl.match(TEST_MODULE_URL_RE)?.[1];
    always(pathMatch);
    const parts = pathMatch.split("/").map((part) => snakeCase(part));
    return parts.join(".");
  }
}
