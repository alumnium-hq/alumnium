import z from "zod";
import { Params } from "@alumnium/core/internal";

/**
 * `params` input of the tools taking a goal, statement or data description
 * with `{placeholder}` tokens. Values that vary between runs then stay out of
 * the text, so a recorded call can be replayed with fresh ones.
 */
export abstract class McpParams {
  static DESCRIPTION =
    "When a value varies between runs (an id, a code, an email, anything an earlier tool produced), " +
    "put a `{placeholder}` in the text and pass the value in `params` instead of inlining it.";

  static input(example: string) {
    return z
      .record(z.string(), z.string())
      .optional()
      .describe(
        `Values for the \`{placeholder}\` tokens in the text, e.g. ${example}. ` +
          "Every placeholder must have a value here, and every value must be referenced by the text.",
      );
  }

  /**
   * Checks a text against its params, so a placeholder without a value never
   * reaches the page as literal `{name}` text.
   */
  static validate(
    text: string,
    params: Params.Values | undefined,
    subject: string,
  ) {
    if (!params) return;

    const names = new Set(
      Array.from(
        text.matchAll(Params.PLACEHOLDER_PATTERN),
        (match) => match[1]!,
      ),
    );
    const unknown = [...names].filter((name) => !(name in params));
    const unreferenced = Object.keys(params).filter((name) => !names.has(name));
    const problems = [];

    if (unknown.length)
      problems.push(`no value in params for ${this.#formatNames(unknown)}`);

    if (unreferenced.length)
      problems.push(
        `params ${this.#formatNames(unreferenced)} not referenced by the ${subject}`,
      );

    if (problems.length)
      throw new Error(`Invalid params: ${problems.join("; ")}`);
  }

  static #formatNames(names: string[]): string {
    return names.map((name) => `{${name}}`).join(", ");
  }
}
