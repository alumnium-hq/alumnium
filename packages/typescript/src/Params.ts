import { ParamsError } from "./client/errors/ParamsError.ts";
import { Telemetry } from "./telemetry/Telemetry.ts";

const { logger } = Telemetry.get(import.meta.url);

// NOTE: Matches an escaped brace (`{{`, `}}`) or a placeholder (`{name}`).
// Escapes are part of the same alternation so a single pass handles both, which
// keeps a substituted value containing braces from being rescanned.
const TOKEN_PATTERN = /\{\{|\}\}|\{([^{}]*)\}/g;

const OPEN_BRACE_ESCAPE = "{{";
const CLOSE_BRACE_ESCAPE = "}}";

export namespace Params {
  export type Values = Record<string, string | number | boolean>;
}

/**
 * Values for the `{placeholder}` tokens of an `Alumni.do` goal.
 *
 * Placeholders exist to keep a goal's text stable when only a value changes, so
 * that goals differing only in that value share a cache entry. Both cache
 * layers key off the goal and the step alone, so the agents are invoked with
 * the placeholder text as their cache identity while the model itself sees the
 * real values — see `ActorAgent.invoke`.
 *
 * Two directions are therefore needed:
 *
 * - `substitute` turns `{city}` into `Paris`. Used for the prompt the model
 *   sees, and for values read back out of the cache.
 * - `mask` turns `Paris` back into `{city}`. Used for everything stored, so a
 *   cached entry is value-agnostic.
 */
export class Params {
  readonly #values: Params.Values;

  /**
   * @param values - Placeholder values, `undefined` when nothing is
   *   parameterized. Both directions are then a no-op.
   */
  static from(values: Params.Values | undefined): Params {
    return new Params(values ?? {});
  }

  private constructor(values: Params.Values) {
    this.#values = values;
  }

  get isEmpty(): boolean {
    return !Object.keys(this.#values).length;
  }

  //#region Validation

  /**
   * Checks a goal against the values before anything reaches the LLM.
   *
   * @param goal - Goal containing `{placeholder}` tokens.
   * @throws ParamsError When the goal has an empty or unknown placeholder, or
   *   when a value is never referenced by the goal.
   */
  validateGoal(goal: string): void {
    if (this.isEmpty) return;

    const goalNames = Params.#placeholderNames(goal);

    if (goalNames.has("")) {
      throw new ParamsError(
        `Goal contains an empty placeholder '{}'. ${this.#knownSuffix()}`,
      );
    }

    const unknownNames = [...goalNames].filter(
      (name) => !(name in this.#values),
    );
    if (unknownNames.length) {
      throw new ParamsError(
        `Goal references unknown parameters: ${formatNames(unknownNames)}. ${this.#knownSuffix()}`,
      );
    }

    const unreferencedNames = Object.keys(this.#values).filter(
      (name) => !goalNames.has(name),
    );
    if (unreferencedNames.length) {
      throw new ParamsError(
        `Parameters are not referenced by the goal: ${formatNames(unreferencedNames)}. ` +
          "Add a placeholder for each one, or drop it.",
      );
    }
  }

  //#endregion

  //#region Substituting

  /**
   * Replaces `{name}` with its value, and unescapes `{{`/`}}`.
   *
   * @param text - Text containing placeholders.
   * @returns Text with the values substituted.
   */
  substitute(text: string): string {
    if (this.isEmpty) return text;

    return text.replace(TOKEN_PATTERN, (token, name: string | undefined) => {
      if (token === OPEN_BRACE_ESCAPE) return "{";
      if (token === CLOSE_BRACE_ESCAPE) return "}";

      // NOTE: An unknown placeholder is left as-is rather than blanked out. It
      // is either the model inventing one, or prose that happens to use braces,
      // and a literal token is easier to debug than a silent deletion.
      if (name === undefined || !(name in this.#values)) {
        logger.debug(`No parameter for placeholder '${token}', leaving as-is`);
        return token;
      }

      return String(this.#values[name]);
    });
  }

  /**
   * Substitutes into every string value of a record, leaving other types alone.
   *
   * @param record - Record to substitute into, e.g. cached element attributes.
   * @returns New record with the values substituted.
   */
  substituteRecord<Type extends Record<string, unknown>>(record: Type): Type {
    if (this.isEmpty) return record;

    return Object.fromEntries(
      Object.entries(record).map(([key, value]) => [
        key,
        typeof value === "string" ? this.substitute(value) : value,
      ]),
    ) as Type;
  }

  //#endregion

  //#region Masking

  /**
   * Replaces each value with its `{name}` placeholder, so that what gets stored
   * does not depend on the value it was recorded with.
   *
   * Longer values are masked first, so a short value cannot corrupt a longer
   * one containing it.
   *
   * @param text - Text containing real values.
   * @returns Text with the values masked.
   */
  mask(text: string): string {
    if (this.isEmpty) return text;

    const sortedEntries = Object.entries(this.#values)
      .map(([name, value]) => ({ name, value: String(value) }))
      .filter(({ value }) => value.length)
      .sort((left, right) => right.value.length - left.value.length);

    let maskedText = text;
    for (const { name, value } of sortedEntries) {
      maskedText = replaceWords(maskedText, value, `{${name}}`);
    }

    return maskedText;
  }

  /**
   * Masks every string value of a record, leaving other types alone.
   *
   * @param record - Record to mask, e.g. extracted element attributes.
   * @returns New record with the values masked.
   */
  maskRecord<Type extends Record<string, unknown>>(record: Type): Type {
    if (this.isEmpty) return record;

    return Object.fromEntries(
      Object.entries(record).map(([key, value]) => [
        key,
        typeof value === "string" ? this.mask(value) : value,
      ]),
    ) as Type;
  }

  //#endregion

  #knownSuffix(): string {
    return `Known parameters: ${formatNames(Object.keys(this.#values))}.`;
  }

  static #placeholderNames(goal: string): Set<string> {
    const names = new Set<string>();

    for (const match of goal.matchAll(TOKEN_PATTERN)) {
      const name = match[1];
      if (name !== undefined) names.add(name);
    }

    return names;
  }
}

function formatNames(names: string[]): string {
  return names.map((name) => `{${name}}`).join(", ");
}

/**
 * Replaces whole-word occurrences of a value, so that masking `1` cannot
 * corrupt `11` and masking `8` cannot corrupt `1.8`.
 */
function replaceWords(
  text: string,
  value: string,
  replacement: string,
): string {
  const pattern = new RegExp(
    `(?<![\\w.])${escapeRegExp(value)}(?![\\w.])`,
    "g",
  );
  return text.replace(pattern, replacement);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
