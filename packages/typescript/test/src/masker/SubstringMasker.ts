import {
  eachStringLeaf,
  escapeRegExp,
  mapOutsideMasks,
} from "./maskerUtils.ts";

/**
 * Masks known values wherever they occur in a string, not only as a whole
 * value or a quoted token. Meant for values specific enough to be matched
 * that way - host variables and secrets - which must never be stored in clear.
 */
export abstract class SubstringMasker {
  /** Suffix of a mask taking the place of a JSON-escaped value. */
  static JSON_SUFFIX = ":json";

  #pattern: RegExp;
  #valueByMask = new Map<string, string>();
  #maskByValue = new Map<string, string>();

  constructor(pattern: RegExp) {
    this.#pattern = pattern;
  }

  get size(): number {
    return this.#valueByMask.size;
  }

  /**
   * Registers a value to mask, and the mask to unmask back to it.
   *
   * @param mask - Mask of the value.
   * @param value - Value to mask.
   */
  protected register(mask: string, value: string) {
    this.#valueByMask.set(mask, value);
    if (!this.#maskByValue.has(value)) this.#maskByValue.set(value, mask);
  }

  /**
   * Masks every registered value in every string leaf of a value.
   *
   * @param value - Value to mask in place, or a string to mask.
   * @returns The same value, or the masked string.
   */
  mask<Type>(value: Type): Type {
    if (!this.#maskByValue.size) return value;

    if (typeof value === "string") return this.maskString(value) as Type;

    eachStringLeaf(value, (leaf) => {
      const masked = this.maskString(leaf);
      return masked === leaf ? undefined : masked;
    });

    return value;
  }

  maskString(value: string): string {
    if (!this.#maskByValue.size) return value;

    const maskByText = new Map<string, string>();
    for (const [secret, mask] of this.#maskByValue) {
      // A value also reaches a recording JSON-escaped,
      // e.g. inside a JSON document a tool writes to a file.
      const escaped = this.#jsonEscaped(secret);
      maskByText.set(secret, mask);
      if (escaped !== secret && !maskByText.has(escaped))
        maskByText.set(escaped, this.#jsonMask(mask));
    }

    // Longest first, so a value containing another one is masked whole.
    const pattern = new RegExp(
      [...maskByText.keys()]
        .sort((a, b) => b.length - a.length)
        .map(escapeRegExp)
        .join("|"),
      "g",
    );

    return mapOutsideMasks(value, (text) =>
      text.replace(pattern, (match) => maskByText.get(match) ?? match),
    );
  }

  /**
   * Substitutes registered values for their masks in every string leaf.
   *
   * @param value - Value to unmask in place.
   * @returns The same value.
   */
  unmask<Type>(value: Type): Type {
    if (!this.#valueByMask.size) return value;

    eachStringLeaf(value, (leaf) => {
      const unmasked = leaf.replace(this.#pattern, (mask) => {
        const escaped = mask.endsWith(`${SubstringMasker.JSON_SUFFIX}>`);
        const value = this.#valueByMask.get(
          escaped
            ? `${mask.slice(0, -SubstringMasker.JSON_SUFFIX.length - 1)}>`
            : mask,
        );
        if (value === undefined) return mask;
        return escaped ? this.#jsonEscaped(value) : value;
      });
      return unmasked === leaf ? undefined : unmasked;
    });

    return value;
  }

  /**
   * Finds registered values that survived masking anywhere in a value.
   *
   * @param value - Value to scan.
   * @returns Masks of the leaked values, never the values themselves.
   */
  findLeaks(value: unknown): string[] {
    const leaks = new Set<string>();

    eachStringLeaf({ value }, (leaf) => {
      mapOutsideMasks(leaf, (text) => {
        for (const [secret, mask] of this.#maskByValue) {
          if (text.includes(secret) || text.includes(this.#jsonEscaped(secret)))
            leaks.add(mask);
        }
        return text;
      });

      return undefined;
    });

    return [...leaks];
  }

  #jsonEscaped(value: string): string {
    return JSON.stringify(value).slice(1, -1);
  }

  #jsonMask(mask: string): string {
    return `${mask.slice(0, -1)}${SubstringMasker.JSON_SUFFIX}>`;
  }
}
