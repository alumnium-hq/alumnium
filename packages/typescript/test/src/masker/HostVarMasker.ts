import { Telemetry } from "@alumnium/core/internal";
import { eachStringLeaf, findMasks } from "./maskerUtils.ts";
import { SubstringMasker } from "./SubstringMasker.ts";

const { logger } = Telemetry.get(import.meta.url);

const HOST_MASK_PREFIX = "<host-var.";
const HOST_VAR_NAME_PATTERN = /^\w+$/;
const HOST_MASK_PATTERN = /<host-var\.\w+(?::json)?>/g;
const HOST_MASK_NAME_PATTERN = /<host-var\.(\w+)(?::json)?>/g;

/**
 * Masks host variables - values the host knows ahead of the run, by name:
 * credentials, base URLs, account ids - as `<host-var.name>` wherever they occur,
 * and substitutes the values the host passes on replay.
 */
export class HostVarMasker extends SubstringMasker {
  /**
   * @param hostVars - Host variables by name.
   */
  constructor(hostVars: Record<string, string> = {}) {
    super(HOST_MASK_PATTERN);

    for (const [name, value] of Object.entries(hostVars)) {
      if (!HOST_VAR_NAME_PATTERN.test(name))
        throw new RangeError(
          `Host variable name '${name}' must only contain word characters`,
        );

      // An empty value would match everywhere, and there is nothing in
      // it to keep out of a recording anyway.
      if (!value) {
        logger.debug(`Host variable ${name} is empty, not masking it`);
        continue;
      }

      this.register(`${HOST_MASK_PREFIX}${name}>`, value);
    }
  }

  /**
   * Finds host variable masks anywhere in a value.
   *
   * @param value - Value to scan.
   * @returns Masks, in order of appearance.
   */
  static findMasks(value: unknown): string[] {
    return findMasks(value, HOST_MASK_PATTERN);
  }

  /**
   * Finds the host variable names a value refers to through `<host-var.name>`
   * masks.
   *
   * @param value - Value to scan, e.g. recording steps.
   * @returns Unique host variable names, in order of appearance.
   */
  static findNames(value: unknown): string[] {
    const names = new Set<string>();

    eachStringLeaf({ value }, (leaf) => {
      for (const [, name] of leaf.matchAll(HOST_MASK_NAME_PATTERN))
        if (name) names.add(name);
      return undefined;
    });

    return [...names];
  }
}
