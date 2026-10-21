import type { Recording } from "../Recording.ts";
import { HostVarMasker } from "./HostVarMasker.ts";
import { parseInput } from "./maskerUtils.ts";
import { ToolCallMasker } from "./ToolCallMasker.ts";

export namespace Masker {
  export interface Props {
    /**
     * Values the host knows ahead of the run, by name: credentials, base URLs,
     * account ids. Each one is masked as `<host-var.name>` wherever it occurs in a
     * recording, and replaced with the value the host passes on replay.
     */
    hostVars?: Record<string, string> | undefined;
    /**
     * JSON paths of secrets in tool results, by tool key (see
     * `Recording.toolKey`), e.g. `{"test-data/createUser": ["**.token"]}`.
     * A path is dot-separated, `*` matches any one key or array index, `**`
     * any number of them, and a path also covers every leaf nested under it
     * (see `ResponsePaths`). Each value it matches is masked as `<secret...>`
     * wherever it occurs, the stored result included,
     * so a recording neverholds it in clear.
     */
    maskResponsePaths?: Record<string, string[]> | undefined;
    /**
     * JSON paths of the values to register in tool results, by tool key, in
     * the same format as `maskResponsePaths`. A tool with paths registers only
     * the values they cover - none for `[]` - and any other tool every value
     * of its JSON output, e.g. `{"alumnium/*": [], "alumnium/start": ["id"]}`
     * registers only the driver id of Alumnium's tools. A `<server>/*` key
     * applies to every tool of the server without a key of its own.
     */
    registerResponsePaths?: Record<string, string[]> | undefined;
    /**
     * Tools whose input is prose that must stay verbatim, so values produced
     * by tool calls are not masked in it. Host variables and secrets are
     * masked regardless.
     */
    verbatimTools?: string[] | undefined;
    /**
     * Tools whose input takes tool call values only as whole values, by tool
     * key (`<server>/*` covers a server), e.g. `["alumnium/*"]`. A quoted value
     * is masked in any other tool's input too: in a command line a quote is
     * what delimits a value, whereas an Alumnium goal is prose an LLM reads,
     * which takes its values from `params`.
     */
    wholeValueOnlyTools?: string[] | undefined;
  }
}

/**
 * Masks the values a recording depends on but must not freeze, and substitutes
 * fresh ones back on replay. One instance covers one run, recording or replay.
 * Masks name the tool call a value came from by the id the host agent gave
 * it, so replay registers each fresh output under the id of the recorded call
 * it re-issued.
 *
 * Composes one masker per source of values:
 *
 * - `ToolCallMasker` - values tool calls produced, as `registerResponsePaths`
 *   selects them. Masked as `<tool-call.id.path>` where a later tool input uses
 *   them, or as `<secret.id.path>` wherever they occur when at one of the
 *   `maskResponsePaths`;
 * - `HostVarMasker` - values the host passes, masked as `<host-var.name>`
 *   wherever they occur.
 */
export class Masker {
  #toolCalls: ToolCallMasker;
  #hostVars: HostVarMasker;

  constructor(props: Masker.Props = {}) {
    const { hostVars, ...toolCallProps } = props;
    this.#toolCalls = new ToolCallMasker(toolCallProps);
    this.#hostVars = new HostVarMasker(hostVars);
  }

  /**
   * Tells whether tool call values are masked in a tool's input at all, see
   * `ToolCallMasker.masksInputOf`.
   *
   * @param toolKey - Tool key, see `Recording.toolKey`.
   */
  masksToolCallValuesOf(toolKey: string): boolean {
    return this.#toolCalls.masksInputOf(toolKey);
  }

  /**
   * Registers values produced by a tool call, Alumnium or any other, so that
   * they can be masked in the tool inputs that follow it (recording) or
   * substituted back into them (replay). Which values count is up to
   * `registerResponsePaths`, which are secrets up to `maskResponsePaths`.
   *
   * Only JSON output is considered, and masks are derived from the JSON path of
   * each leaf. The same leaf therefore yields the same mask in both phases, even
   * when a fresh output reorders its keys or adds new ones.
   *
   * @param callId - Id of the tool call, as the host agent assigned it.
   * @param content - Tool call result content.
   * @param toolKey - Tool key (see `Recording.toolKey`) for the response paths.
   */
  registerOutput(
    callId: string,
    content: Recording.Content,
    toolKey?: string,
    options?: ToolCallMasker.RegisterOptions,
  ) {
    this.#toolCalls.registerContent(callId, content, toolKey, options);
  }

  //#region Inspection

  /**
   * Finds masks that unmasking could not resolve, which means a replay lacks a
   * value its recording had: a tool produced fewer values, or the
   * host did not pass a variable.
   *
   * A tool call value mask only counts when it takes up a whole value
   * (see `ToolCallMasker.findUnresolved`). Host variable and secret masks
   * count anywhere.
   *
   * @param input - Unmasked tool input.
   * @returns Unresolved masks, empty when everything resolved.
   */
  static findUnresolvedMasks(input: Recording.Input): string[] {
    return [
      ...new Set([
        ...ToolCallMasker.findUnresolved(input),
        ...HostVarMasker.findMasks(input),
      ]),
    ];
  }

  /**
   * Finds the host variable names a value refers to through `<host-var.name>`
   * masks.
   *
   * @param value - Value to scan, e.g. recording steps.
   * @returns Unique host variable names, in order of appearance.
   */
  static findHostVarNames(value: unknown): string[] {
    return HostVarMasker.findNames(value);
  }

  /**
   * Finds host variables and secrets whose values survived masking anywhere in
   * a value, e.g. a recording about to be saved.
   *
   * @param value - Value to scan.
   * @returns Masks of the leaked values, never the values themselves.
   */
  findLeaks(value: unknown): string[] {
    return [
      ...this.#hostVars.findLeaks(value),
      ...this.#toolCalls.findLeaks(value),
    ];
  }

  //#endregion
  //#region Masking

  /**
   * Masks a tool input: tool call values (see `wholeValueOnlyTools` and
   * `verbatimTools`), host variables and secrets.
   *
   * @param toolKey - Tool key, see `Recording.toolKey`.
   * @param input - Tool input, left untouched.
   * @returns Masked copy of the input.
   */
  maskInput(toolKey: string, input: unknown): Recording.Input {
    return this.#hostVars.mask(
      this.#toolCalls.maskInput(toolKey, parseInput(input)),
    );
  }

  /**
   * Masks a tool result, Alumnium or any other. Tool call values stay as they
   * were, since nothing reads them back from a recording, but host variables
   * and secrets do not - including the ones this very result produced, so
   * register the output first.
   *
   * @param content - Tool result content, left untouched.
   * @returns Masked copy of the content.
   */
  maskResult(content: Recording.Content): Recording.Content {
    return this.#maskSecrets(structuredClone(content));
  }

  /**
   * Masks host variables and secrets in the agent's narration.
   *
   * Tool call values are not masked here. Masking matches whole values
   * and quoted tokens, neither of which is how prose mentions a value, so a
   * recording can carry a value the agent happened to write out.
   *
   * @param text - Narration as the agent wrote it.
   * @returns Masked narration.
   */
  maskNarration(text: string): string {
    return this.#maskSecrets(text);
  }

  /**
   * Secrets go first, since they are specific to the run, so a host
   * variable that happens to be part of one does not break it apart. The same
   * goes for every other `mask` method.
   */
  #maskSecrets<Type>(value: Type): Type {
    return this.#hostVars.mask(this.#toolCalls.maskSecrets(value));
  }

  //#endregion

  //#region Unmasking

  /**
   * Substitutes fresh values back into a tool input, e.g. so that a shell
   * command runs with the value the fresh run produced.
   *
   * A mask with no registered value is left in place on purpose, so
   * that `findUnresolvedMasks` can name the input it was needed for.
   *
   * @param toolKey - Tool key, see `Recording.toolKey`.
   * @param input - Masked tool input, left untouched.
   * @returns Unmasked copy of the input.
   */
  unmaskInput(toolKey: string, input: unknown): Recording.Input {
    return this.#hostVars.unmask(
      this.#toolCalls.unmaskInput(toolKey, parseInput(input)),
    );
  }

  //#endregion
}
