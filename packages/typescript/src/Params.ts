import { ParamsError } from "./client/errors/ParamsError.ts";
import { Telemetry } from "./telemetry/Telemetry.ts";

const { logger } = Telemetry.get(import.meta.url);

// NOTE: Matches an escaped brace (`{{`, `}}`) or a placeholder (`{name}`).
// Escapes are part of the same alternation so a single pass handles both, which
// keeps a substituted value containing braces from being rescanned.
const TOKEN_PATTERN = /\{\{|\}\}|\{([^{}]*)\}/g;

// NOTE: No escape arm, and a name restricted to identifier characters, so that
// neither a quoted JSON key nor a nested object's `}}` can be read as a
// placeholder. See `Params.Mode` for why that matters.
const STRUCTURED_TOKEN_PATTERN = /\{([A-Za-z0-9_]+)\}/g;

const OPEN_BRACE_ESCAPE = "{{";
const CLOSE_BRACE_ESCAPE = "}}";

export namespace Params {
  export type Values = Record<string, string | number | boolean>;

  /** What the parameterized text is, as the error messages name it. */
  export type Subject =
    | "goal"
    | "statement"
    | "data"
    | "condition"
    | "capabilities";

  /**
   * How the braces of a text are read.
   *
   * `prose` is free-form text a model reads, where `{{` and `}}` escape a
   * literal brace.
   *
   * `structured` is text whose braces are structure rather than prose - a path,
   * or inline JSON. There a name only counts as a placeholder when it is made
   * of identifier characters, and nothing is unescaped. Both are required:
   * `{"platformName": "chrome"}` would otherwise read as a placeholder, and the
   * trailing `}}` of a nested object would be collapsed to a single brace,
   * quietly turning valid JSON into unparseable JSON.
   */
  export type Mode = "prose" | "structured";
}

/**
 * Values for the `{placeholder}` tokens of a parameterized text - an
 * `Alumni.do` goal, an `Alumni.check` statement, a `start` capabilities path.
 *
 * Placeholders keep a text stable when only a value changes, which is worth
 * something in two different ways:
 *
 * - For `do`, it is cache identity. Both cache layers key off the goal and the
 *   step alone, so the agents are invoked with the placeholder text as their
 *   cache identity while the model itself sees the real values — see
 *   `ActorAgent.invoke`.
 * - For `check`, `get`, `wait` and `start`, it is replay. A recorded step whose
 *   values sit in `params` rather than inlined in its text can be replayed
 *   against freshly produced ones — see `ScenarioMasker`. Those tools take no
 *   part in caching, and substitute before the request leaves the client.
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
   * Checks a parameterized text against the values before anything acts on it.
   *
   * @param text - Text containing `{placeholder}` tokens.
   * @param subject - What the text is, as the error messages name it.
   * @param mode - How the braces of the text are read.
   * @throws ParamsError When the text has an empty or unknown placeholder, or
   *   when a value is never referenced by the text.
   */
  validate(
    text: string,
    subject: Params.Subject = "goal",
    mode: Params.Mode = "prose",
  ): void {
    if (this.isEmpty) return;

    const textNames = Params.#placeholderNames(text, mode);

    if (textNames.has("")) {
      throw new ParamsError(
        `The ${subject} contains an empty placeholder '{}'. ${this.#knownSuffix()}`,
      );
    }

    const unknownNames = [...textNames].filter(
      (name) => !(name in this.#values),
    );
    if (unknownNames.length) {
      throw new ParamsError(
        `The ${subject} references unknown parameters: ${formatNames(unknownNames)}. ${this.#knownSuffix()}`,
      );
    }

    const unreferencedNames = Object.keys(this.#values).filter(
      (name) => !textNames.has(name),
    );
    if (unreferencedNames.length) {
      throw new ParamsError(
        `Parameters are not referenced by the ${subject}: ${formatNames(unreferencedNames)}. ` +
          "Add a placeholder for each one, or drop it.",
      );
    }
  }

  //#endregion

  //#region Substituting

  /**
   * Replaces `{name}` with its value, and in `prose` mode unescapes `{{`/`}}`.
   *
   * @param text - Text containing placeholders.
   * @param mode - How the braces of the text are read.
   * @returns Text with the values substituted.
   */
  substitute(text: string, mode: Params.Mode = "prose"): string {
    if (this.isEmpty) return text;

    return text.replace(
      Params.#tokenPattern(mode),
      (token, name: string | undefined) => {
        // NOTE: Only in `prose`. In `structured` mode a brace pair is structure,
        // so collapsing `}}` would break the very JSON being substituted into.
        if (mode === "prose") {
          if (token === OPEN_BRACE_ESCAPE) return "{";
          if (token === CLOSE_BRACE_ESCAPE) return "}";
        }

        // NOTE: An unknown placeholder is left as-is rather than blanked out. It
        // is either the model inventing one, or prose that happens to use
        // braces, and a literal token is easier to debug than a silent deletion.
        if (name === undefined || !(name in this.#values)) {
          logger.debug(
            `No parameter for placeholder '${token}', leaving as-is`,
          );
          return token;
        }

        return String(this.#values[name]);
      },
    );
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

  static #placeholderNames(text: string, mode: Params.Mode): Set<string> {
    const names = new Set<string>();

    for (const match of text.matchAll(Params.#tokenPattern(mode))) {
      const name = match[1];
      if (name !== undefined) names.add(name);
    }

    return names;
  }

  static #tokenPattern(mode: Params.Mode): RegExp {
    return mode === "structured" ? STRUCTURED_TOKEN_PATTERN : TOKEN_PATTERN;
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
