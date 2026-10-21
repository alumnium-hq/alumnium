import { Telemetry } from "@alumnium/core/internal";
import type { Recording } from "../Recording.ts";
import {
  contentTexts,
  eachStringLeaf,
  hasToolKey,
  maskSegment,
  parseJsonStructure,
} from "./maskerUtils.ts";
import { ResponsePaths } from "./ResponsePaths.ts";
import { SecretMasker } from "./SecretMasker.ts";

const { logger } = Telemetry.get(import.meta.url);

const TOOL_CALL_MASK_PREFIX = "<tool-call.";
const TOOL_CALL_MASK_PATTERN = /^<tool-call\.\w+(?:\.\w+)+>$/;

// A quote, escaped by any number of backslashes, e.g. `"`, `\"` or `\\"`.
const QUOTED_DELIMITER_SOURCE = String.raw`\\*['"]`;

// A run between two identical delimiters, e.g. `"a1"` or `\"a1\"`. A run
// holds the other quote freely, so `"it's"` is one run.
const QUOTED_RUN_PATTERN = new RegExp(
  String.raw`(\\*)(?:'([^'\\]*)\1'|"([^"\\]*)\1")`,
  "g",
);
const QUOTED_TOOL_CALL_MASK_PATTERN = new RegExp(
  `(${QUOTED_DELIMITER_SOURCE})(<tool-call\\.\\w+(?:\\.\\w+)+>)\\1`,
  "g",
);

const UNMASKED_INPUT_PATHS = new Set(["description"]);

const DEFAULT_VERBATIM_TOOLS = ["TodoWrite"];

// Dot-separated, since a dot rarely appears in a JSON key, so masks of distinct
// paths rarely collide. See `maskSegment`.
const PATH_SEPARATOR = ".";

export namespace ToolCallMasker {
  export interface Props {
    /** @see Masker.Props.verbatimTools */
    verbatimTools?: string[] | undefined;
    /** @see Masker.Props.wholeValueOnlyTools */
    wholeValueOnlyTools?: string[] | undefined;
    /** @see `Masker.Props.maskResponsePaths`. */
    maskResponsePaths?: Record<string, string[]> | undefined;
    /** @see `Masker.Props.registerResponsePaths`. */
    registerResponsePaths?: Record<string, string[]> | undefined;
  }

  /**
   * Which strings a mask can take the place of.
   * - whole: a tool call value in full (e.g. `{"id": "a1"}`).
   * - embedded: a quote-delimited value inside a larger string (e.g. `echo '{"id": "a1"}'`).
   */
  export type Scope = "whole" | "embedded";

  export interface Leaf {
    path: string[];
    value: string;
  }

  export interface RegisterOptions {
    /** Registers only the leaves at `maskResponsePaths`, e.g. of a failed call. */
    secretsOnly?: boolean | undefined;
  }

  export interface Registered {
    mask: string;
    value: string;
  }
}

/**
 * Masks values tool calls produced, and substitutes the values the replay's
 * fresh calls produce. Masks are derived from the JSON path of each output
 * leaf, so the same leaf yields the same mask in both phases:
 *
 * - `<tool-call.id.path>` - an ordinary value, masked only where a later tool
 *   input uses it as a whole value (or a quoted one, in the `embedded` scope),
 *   since it can be short or common;
 * - `<secret.id.path>` - a value at one of the tool's `maskResponsePaths`,
 *   masked like an ordinary one and also wherever else it occurs, results and
 *   narration included, since it must never be stored in clear (see
 *   `SecretMasker`).
 */
export class ToolCallMasker {
  #verbatimTools: Set<string>;
  #wholeValueOnlyTools: Set<string>;
  #registerPaths: ResponsePaths;
  #secrets: SecretMasker;

  #valueByMask = new Map<string, string>(); // Mask -> tool call value, for unmasking.
  #maskByValue = new Map<string, string>(); // Tool call value -> mask, for masking.

  constructor(props: ToolCallMasker.Props = {}) {
    this.#verbatimTools = new Set(
      props.verbatimTools ?? DEFAULT_VERBATIM_TOOLS,
    );
    this.#wholeValueOnlyTools = new Set(props.wholeValueOnlyTools);
    this.#registerPaths = new ResponsePaths(props.registerResponsePaths);
    this.#secrets = new SecretMasker(props.maskResponsePaths);
  }

  /**
   * Tells whether tool call values are masked in a tool's input at all.
   *
   * Every tool but a verbatim one qualifies, including one replay cannot
   * execute: the point of masking such an input is that the value a run
   * produced does not end up persisted in the recording, not that it gets
   * substituted again.
   *
   * @param toolKey - Tool key, see `Recording.toolKey`.
   * @returns `false` when the tool's input is prose that must stay verbatim.
   */
  masksInputOf(toolKey: string): boolean {
    return !hasToolKey(this.#verbatimTools, toolKey);
  }

  /**
   * Scope tool call values are masked in for a tool's input: `whole` for one
   * of `wholeValueOnlyTools`, `embedded` for any other.
   *
   * @param toolKey - Tool key, see `Recording.toolKey`.
   */
  scopeOf(toolKey: string): ToolCallMasker.Scope {
    return hasToolKey(this.#wholeValueOnlyTools, toolKey)
      ? "whole"
      : "embedded";
  }

  /**
   * Masks a tool's input in the tool's scope (see `scopeOf`), or only its
   * secrets when the tool's input must stay verbatim.
   *
   * @param toolKey - Tool key, see `Recording.toolKey`.
   * @param input - Tool input, masked in place.
   * @returns The same input.
   */
  maskInput(toolKey: string, input: Recording.Input): Recording.Input {
    if (!this.masksInputOf(toolKey)) return this.maskSecrets(input);
    return this.mask(input, this.scopeOf(toolKey));
  }

  /**
   * Substitutes fresh values back into a tool's input, in the tool's scope.
   *
   * @param toolKey - Tool key, see `Recording.toolKey`.
   * @param input - Masked tool input, unmasked in place.
   * @returns The same input.
   */
  unmaskInput(toolKey: string, input: Recording.Input): Recording.Input {
    return this.unmask(input, this.scopeOf(toolKey));
  }

  //#region Registration

  /**
   * Finds masks unmasking could not resolve: a `<tool-call...>` one that
   * takes up a whole value, a `<secret...>` one anywhere.
   *
   * An ordinary mask inside a quoted token does not count. An unresolved
   * one there just replays the command as recorded rather than failing the
   * replay, whereas a secret replayed as its mask is never right.
   *
   * @param input - Unmasked tool input.
   * @returns Masks, in order of appearance.
   */
  static findUnresolved(input: Recording.Input): string[] {
    const masks: string[] = [];

    eachStringLeaf(input, (value) => {
      if (TOOL_CALL_MASK_PATTERN.test(value)) masks.push(value);
      return undefined;
    });

    return [...masks, ...SecretMasker.findMasks(input)];
  }

  /**
   * Finds secrets that survived masking anywhere in a value, see
   * `SecretMasker.findLeaks`.
   *
   * @param value - Value to scan.
   * @returns Masks of the leaked secrets, never the secrets themselves.
   */
  findLeaks(value: unknown): string[] {
    return this.#secrets.findLeaks(value);
  }

  /**
   * Registers the values of a tool call result. Only JSON output is
   * considered, so the same leaf yields the same mask in both phases even
   * when a fresh output reorders its keys or adds new ones.
   *
   * @param callId - Id of the tool call, as the host agent assigned it.
   * @param content - Tool call result content.
   * @param toolKey - Tool key (see `Recording.toolKey`) for the response paths.
   * @returns Leaves registered, with their masks.
   */
  registerContent(
    callId: string,
    content: Recording.Content,
    toolKey?: string,
    options: ToolCallMasker.RegisterOptions = {},
  ): ToolCallMasker.Registered[] {
    // Checked before parsing, so that a tool registering nothing - e.g.
    // one returning an accessibility tree - is not reported as non-JSON.
    if (this.#registersNothing(toolKey, options)) return [];

    const text = contentTexts(content).join("\n").trim();
    if (!text) {
      logger.debug(`Tool call ${callId} produced no text output`);
      return [];
    }

    const json = parseJsonStructure(text);
    if (!json) {
      logger.info(
        `Tool call ${callId} output is not a JSON object or array, ignoring it for masking. ` +
          "The values it produced will be replayed as recorded.",
      );
      logger.debug(`-> Output: ${text}`);
      if (this.#secrets.hasPaths(toolKey)) this.#secrets.markUnread(callId);
      return [];
    }

    return this.registerOutput(callId, json, toolKey, options);
  }

  /**
   * Registers the scalar leaves of a tool call's JSON output, so that they
   * can be masked in the tool inputs that follow it (recording) or
   * substituted back into them (replay).
   *
   * A tool with `registerResponsePaths` registers only the leaves they cover,
   * any other tool every leaf. A leaf at one of the tool's
   * `maskResponsePaths` becomes a secret, and is registered regardless, since
   * it must be kept out of the recording either way.
   *
   * @param callId - Id of the tool call, as the host agent assigned it.
   * @param json - Parsed JSON output of the call.
   * @param toolKey - Tool key (see `Recording.toolKey`) for the response paths.
   * @returns Leaves registered, with their masks.
   */
  registerOutput(
    callId: string,
    json: object,
    toolKey?: string,
    options: ToolCallMasker.RegisterOptions = {},
  ): ToolCallMasker.Registered[] {
    const registered: ToolCallMasker.Registered[] = [];

    this.#collectJsonLeaves(json).forEach(({ path, value }) => {
      const secret = this.#secrets.isSecret(toolKey, path);
      if (!secret && (options.secretsOnly || !this.#registers(toolKey, path)))
        return;

      const prefix = secret ? SecretMasker.PREFIX : TOOL_CALL_MASK_PREFIX;
      let mask = this.#leafMask(prefix, callId, path);

      // Distinct paths can sanitize to the same mask (`a-b` and `a_b`).
      if (this.#valueByMask.has(mask)) {
        if (!secret) {
          logger.warn(`Tool call mask ${mask} is already registered, skipping`);
          return;
        }
        mask = this.#uniqueMask(mask);
      }

      this.#valueByMask.set(mask, value);
      // Keep the earliest call's mask, so replay substitutes that call's fresh value.
      if (!this.#maskByValue.has(value)) this.#maskByValue.set(value, mask);
      if (secret) this.#secrets.registerSecret(mask, value);

      logger.debug(`Registered tool call value ${mask}`);
      registered.push({ mask, value });
    });

    return registered;
  }

  #registers(toolKey: string | undefined, path: string[]): boolean {
    return (
      !this.#registerPaths.of(toolKey) ||
      this.#registerPaths.covers(toolKey, path)
    );
  }

  #registersNothing(
    toolKey: string | undefined,
    options: ToolCallMasker.RegisterOptions,
  ): boolean {
    if (this.#secrets.hasPaths(toolKey)) return false;
    return (
      !!options.secretsOnly || this.#registerPaths.of(toolKey)?.length === 0
    );
  }

  /**
   * Collects every scalar leaf of a JSON structure together with its path.
   *
   * @param json - JSON structure to walk.
   * @returns Leaves sorted by path.
   */
  #collectJsonLeaves(json: object): ToolCallMasker.Leaf[] {
    const leaves: ToolCallMasker.Leaf[] = [];

    const walk = (value: unknown, path: string[]) => {
      if (Array.isArray(value)) {
        value.forEach((item, index) => walk(item, [...path, String(index)]));
        return;
      }

      if (typeof value === "object" && value !== null) {
        for (const [key, nested] of Object.entries(value))
          walk(nested, [...path, key]);
        return;
      }

      // NOTE: Booleans and nulls carry nothing specific to the run that produced
      // them, so a tool input that happens to equal `true` would be a false
      // positive rather than a value worth substituting.
      if (typeof value !== "string" && typeof value !== "number") return;

      const leafValue = String(value);
      if (!leafValue.trim()) return;

      leaves.push({ path, value: leafValue });
    };

    walk(json, []);

    // Sorted by path rather than kept in key order, which a fresh output can
    // change: distinct paths sanitizing to the same mask then resolve the same
    // way in both phases.
    return leaves.sort((a, b) => comparePaths(a.path, b.path));
  }

  /**
   * Suffixes a mask already registered with the first free `_<n>`.
   *
   * @param mask - Mask taken by another leaf.
   * @returns Mask no leaf has yet.
   */
  #uniqueMask(mask: string): string {
    const base = mask.slice(0, -1);
    let index = 2;
    while (this.#valueByMask.has(`${base}_${index}>`)) index++;
    return `${base}_${index}>`;
  }

  /**
   * Builds the mask for a JSON leaf, e.g. `["items", "2", "id"]` of tool call
   * `toolu_01` becomes `<tool-call.toolu_01.items.2.id>`.
   *
   * @param prefix - Mask family prefix, e.g. `<tool-call.`.
   * @param callId - Id of the tool call, as the host agent assigned it.
   * @param path - JSON path of the leaf.
   * @returns Mask to replace the leaf's value with.
   */
  #leafMask(prefix: string, callId: string, path: string[]): string {
    return `${prefix}${[callId, ...path].map(maskSegment).join(PATH_SEPARATOR)}>`;
  }

  //#endregion
  //#region Masking

  /**
   * Replaces values produced by tool calls with masks, so that replay can
   * substitute freshly produced ones.
   *
   * In the `whole` scope only a leaf that equals a tool call value in full is
   * replaced. A value quoted inside free-form prose is left alone: there is no
   * way to tell a value apart from the prose around it without guessing, and
   * every Alumnium tool that takes prose takes such values through `params`.
   *
   * Secrets are then masked wherever else they occur, see `maskSecrets`.
   *
   * @param input - Tool input, masked in place.
   * @param scope - Which strings a mask can take the place of.
   * @returns The same input.
   */
  mask(input: Recording.Input, scope: ToolCallMasker.Scope): Recording.Input {
    if (!this.#maskByValue.size) return input;

    eachStringLeaf(input, (value, path) => {
      if (scope === "embedded" && UNMASKED_INPUT_PATHS.has(path))
        return undefined;

      const mask = this.#maskByValue.get(value);
      if (mask) {
        logger.debug(
          `Masked tool call value in '${path}': '${value}' -> '${mask}'`,
        );
        return mask;
      }

      if (scope !== "embedded") return undefined;

      return this.#maskQuoted(value, path);
    });

    return this.maskSecrets(input);
  }

  /**
   * Masks secrets wherever they occur in every string leaf of a value, e.g. a
   * tool result, narration, or the input of a tool that must stay verbatim.
   *
   * @param value - Value to mask in place, or a string to mask.
   * @returns The same value, or the masked string.
   */
  maskSecrets<Type>(value: Type): Type {
    return this.#secrets.mask(value);
  }

  /**
   * Masks every quote-delimited token of a string that names a tool call value.
   *
   * Only a token a quote pair delimits is looked up. An unquoted one has no
   * boundary to trust, and guessing one is exactly what whole-value matching
   * avoids - a call that produced `9` would otherwise rewrite `--retries 19`.
   *
   * A short or common value can still match a quoted token that has
   * nothing to do with it. That ambiguity is inherent to matching by value,
   * and a length or numeric heuristic would silently break the legitimate case
   * of `{"count": 2}` feeding `--count "2"`, so there is none.
   *
   * @param value - Tool input string to scan.
   * @param path - Path of the string, used for logging.
   * @returns The string with its tokens masked, `undefined` when none matched.
   */
  #maskQuoted(value: string, path: string): string | undefined {
    const result = this.#maskQuotedRuns(value, path);
    return result === value ? undefined : result;
  }

  /**
   * Masks the quoted runs of a string, see `#maskQuoted`. Innermost run wins:
   * `echo '{"id": "a1"}'` yields `id` and `a1`, not the JSON around them.
   *
   * @param value - String to scan.
   * @param path - Path of the string, used for logging.
   * @returns The string with its tokens masked.
   */
  #maskQuotedRuns(value: string, path: string): string {
    return value.replace(
      QUOTED_RUN_PATTERN,
      (match, escapes: string, single?: string, double?: string) => {
        const delimiter = `${escapes}${single === undefined ? '"' : "'"}`;
        const token = single ?? double ?? "";

        if (token.search(QUOTED_RUN_PATTERN) >= 0)
          return `${delimiter}${this.#maskQuotedRuns(token, path)}${delimiter}`;

        const mask = this.#maskByValue.get(token);
        if (!mask) return match;

        logger.debug(
          `Masked quoted tool call value in '${path}': '${token}' -> '${mask}'`,
        );

        return `${delimiter}${mask}${delimiter}`;
      },
    );
  }

  //#endregion
  //#region Unmasking

  /**
   * Substitutes fresh tool call values back into a tool input, secrets
   * wherever they occur.
   *
   * A mask with no registered value is left in place, so that
   * `findUnresolved` can name the input it was needed for.
   *
   * @param input - Masked tool input, unmasked in place.
   * @param scope - Which strings a mask can have taken the place of.
   * @returns The same input.
   */
  unmask(input: Recording.Input, scope: ToolCallMasker.Scope): Recording.Input {
    if (!this.#valueByMask.size) return input;

    eachStringLeaf(input, (mask, path) => {
      const value = this.#valueByMask.get(mask);
      if (value !== undefined) {
        logger.debug(
          `Unmasked tool call value in '${path}': '${mask}' -> '${value}'`,
        );
        return value;
      }

      if (scope === "embedded") return this.#unmaskQuoted(mask, path);
    });

    // Substituted as is, with no quoting check: a secret was masked
    // wherever it occurred, quoted or not.
    return this.#secrets.unmask(input);
  }

  /**
   * Substitutes fresh values for every quote-delimited mask of a string, the
   * inverse of `#maskQuoted`.
   *
   * Masking only ever emits a mask between two identical delimiters, and a mask
   * carries neither a quote nor a backslash of its own, so the quoted shape here
   * is exactly the one masking produced, escaping included.
   *
   * @param value - Masked tool input string to scan.
   * @param path - Path of the string, used for logging.
   * @returns The string with its masks replaced, `undefined` when none were.
   */
  #unmaskQuoted(value: string, path: string): string | undefined {
    let unmasked = false;

    const result = value.replace(
      QUOTED_TOOL_CALL_MASK_PATTERN,
      (match, delimiter: string, mask: string) => {
        const fresh = this.#valueByMask.get(mask);
        if (fresh === undefined) return match;

        if (this.#breaksQuoting(fresh, delimiter)) {
          logger.warn(
            `Fresh tool call value for ${mask} cannot be quoted with ${delimiter} in '${path}', leaving the mask in place`,
          );
          return match;
        }

        logger.debug(
          `Unmasked quoted tool call value in '${path}': '${mask}' -> '${fresh}'`,
        );
        unmasked = true;

        return `${delimiter}${fresh}${delimiter}`;
      },
    );

    return unmasked ? result : undefined;
  }

  /**
   * Tells whether substituting a value into a quoted run would end that run early
   * or change what the value means.
   *
   * Refusing beats escaping: an escape is shell-dialect specific, and the string
   * the value goes into is not necessarily a shell command at all. Leaving the
   * mask in place replays the command as recorded, which is visible, whereas a
   * mis-quoted command could quietly do something else.
   *
   * Inside single quotes a shell takes everything literally, so only the quote
   * itself is a problem. Inside double quotes, or the escape layer an escaped
   * delimiter implies, a backslash, `$` or backtick would still be interpreted.
   *
   * @param value - Fresh tool call value to substitute.
   * @param delimiter - Quote, possibly escaped, the recorded token was between.
   * @returns `true` when the value cannot go inside that delimiter.
   */
  #breaksQuoting(value: string, delimiter: string): boolean {
    const quote = delimiter.slice(-1);
    if (value.includes(quote)) return true;

    const interprets = quote === '"' || delimiter.length > 1;
    return interprets && /[\\$`]/.test(value);
  }

  //#endregion
}

function comparePaths(a: string[], b: string[]): number {
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    const [left = "", right = ""] = [a[index], b[index]];
    if (left !== right) return left < right ? -1 : 1;
  }
  return a.length - b.length;
}
